BEGIN;

DO $roles$
BEGIN
  BEGIN
    CREATE ROLE process_daemon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END
$roles$;

CREATE OR REPLACE FUNCTION process.session_actor_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
BEGIN
  IF pg_has_role(session_user, 'process_judge', 'member') THEN RETURN 'judge'; END IF;
  IF pg_has_role(session_user, 'process_preflight', 'member') THEN RETURN 'preflight'; END IF;
  IF pg_has_role(session_user, 'process_daemon', 'member') THEN RETURN 'daemon'; END IF;
  IF pg_has_role(session_user, 'process_coordinator', 'member') THEN RETURN 'coordinator'; END IF;
  IF pg_has_role(session_user, 'process_reader', 'member') THEN RETURN 'reader'; END IF;
  RETURN 'unauthorized';
END
$function$;

CREATE TABLE IF NOT EXISTS process.control_command (
  command_id uuid PRIMARY KEY,
  stream_id text NOT NULL CHECK (length(stream_id) BETWEEN 1 AND 256),
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 1 AND 256),
  kind text NOT NULL CHECK (kind ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (payload_sha256 = process.jsonb_sha256(payload))
);

CREATE TABLE IF NOT EXISTS process.control_event (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  command_id uuid NOT NULL REFERENCES process.control_command(command_id) ON DELETE RESTRICT,
  stream_id text NOT NULL CHECK (length(stream_id) BETWEEN 1 AND 256),
  kind text NOT NULL CHECK (kind ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (payload_sha256 = process.jsonb_sha256(payload))
);

CREATE INDEX IF NOT EXISTS control_event_stream_sequence_idx
  ON process.control_event(stream_id, sequence);

CREATE TABLE IF NOT EXISTS process.control_artifact (
  artifact_id uuid PRIMARY KEY,
  command_id uuid NOT NULL REFERENCES process.control_command(command_id) ON DELETE RESTRICT,
  stream_id text NOT NULL CHECK (length(stream_id) BETWEEN 1 AND 256),
  kind text NOT NULL CHECK (kind ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  media_type text NOT NULL CHECK (length(media_type) BETWEEN 1 AND 255),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 20971520),
  sha256 text NOT NULL CHECK (sha256 ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (sha256 = 'sha256:' || encode(public.digest(content, 'sha256'), 'hex'))
);

CREATE TABLE IF NOT EXISTS process.control_projection (
  stream_id text PRIMARY KEY CHECK (length(stream_id) BETWEEN 1 AND 256),
  cursor bigint NOT NULL CHECK (cursor >= 0),
  event_count integer NOT NULL CHECK (event_count >= 0),
  last_event_kind text,
  replay_sha256 text NOT NULL CHECK (replay_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS process.control_cursor (
  consumer_id text NOT NULL CHECK (length(consumer_id) BETWEEN 1 AND 256),
  stream_id text NOT NULL CHECK (length(stream_id) BETWEEN 1 AND 256),
  cursor bigint NOT NULL CHECK (cursor >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (consumer_id, stream_id)
);

CREATE OR REPLACE FUNCTION process.reduce_control_stream(p_stream_id text)
RETURNS process.control_projection
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
DECLARE
  next_cursor bigint;
  next_count integer;
  next_kind text;
  projection_payload jsonb;
  result process.control_projection%ROWTYPE;
BEGIN
  SELECT COALESCE(max(sequence), 0), count(*)::integer
  INTO next_cursor, next_count
  FROM process.control_event
  WHERE stream_id = p_stream_id;

  SELECT kind INTO next_kind
  FROM process.control_event
  WHERE stream_id = p_stream_id
  ORDER BY sequence DESC
  LIMIT 1;

  projection_payload := jsonb_build_object(
    'cursor', next_cursor::text,
    'eventCount', next_count,
    'lastEventKind', next_kind,
    'streamId', p_stream_id
  );

  INSERT INTO process.control_projection(
    stream_id, cursor, event_count, last_event_kind, replay_sha256, updated_at
  ) VALUES (
    p_stream_id,
    next_cursor,
    next_count,
    next_kind,
    process.jsonb_sha256(projection_payload),
    clock_timestamp()
  )
  ON CONFLICT (stream_id) DO UPDATE SET
    cursor = EXCLUDED.cursor,
    event_count = EXCLUDED.event_count,
    last_event_kind = EXCLUDED.last_event_kind,
    replay_sha256 = EXCLUDED.replay_sha256,
    updated_at = EXCLUDED.updated_at
  RETURNING * INTO result;

  RETURN result;
END
$function$;

CREATE OR REPLACE FUNCTION process.append_control_command(
  p_command_id uuid,
  p_stream_id text,
  p_idempotency_key text,
  p_kind text,
  p_payload jsonb,
  p_events jsonb
)
RETURNS TABLE(
  command_id uuid,
  cursor bigint,
  event_count integer,
  replay_sha256 text,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
DECLARE
  actor text := process.session_actor_role();
  existing process.control_command%ROWTYPE;
  item jsonb;
  projection process.control_projection%ROWTYPE;
BEGIN
  IF actor NOT IN ('coordinator', 'daemon') THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'CONTROL_EVENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing
  FROM process.control_command
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF existing.command_id <> p_command_id
       OR existing.stream_id <> p_stream_id
       OR existing.kind <> p_kind
       OR existing.payload_sha256 <> process.jsonb_sha256(p_payload) THEN
      RAISE EXCEPTION 'CONTROL_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO STRICT projection
    FROM process.control_projection
    WHERE stream_id = p_stream_id;
    RETURN QUERY SELECT existing.command_id, projection.cursor, projection.event_count,
      projection.replay_sha256, true;
    RETURN;
  END IF;

  INSERT INTO process.control_command(
    command_id, stream_id, idempotency_key, kind, payload, payload_sha256
  ) VALUES (
    p_command_id, p_stream_id, p_idempotency_key, p_kind, p_payload,
    process.jsonb_sha256(p_payload)
  );

  FOR item IN SELECT value FROM jsonb_array_elements(p_events)
  LOOP
    INSERT INTO process.control_event(
      event_id, command_id, stream_id, kind, payload, payload_sha256
    ) VALUES (
      (item->>'eventId')::uuid,
      p_command_id,
      p_stream_id,
      item->>'kind',
      item->'payload',
      process.jsonb_sha256(item->'payload')
    );
  END LOOP;

  SELECT * INTO STRICT projection FROM process.reduce_control_stream(p_stream_id);
  RETURN QUERY SELECT p_command_id, projection.cursor, projection.event_count,
    projection.replay_sha256, false;
END
$function$;

CREATE OR REPLACE FUNCTION process.register_control_artifact(
  p_artifact_id uuid,
  p_command_id uuid,
  p_stream_id text,
  p_kind text,
  p_media_type text,
  p_content bytea,
  p_sha256 text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
BEGIN
  IF process.session_actor_role() NOT IN ('coordinator', 'daemon') THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  INSERT INTO process.control_artifact(
    artifact_id, command_id, stream_id, kind, media_type, content, sha256
  ) VALUES (
    p_artifact_id, p_command_id, p_stream_id, p_kind, p_media_type, p_content, p_sha256
  );
  RETURN p_artifact_id;
END
$function$;

CREATE OR REPLACE FUNCTION process.read_control_events(
  p_stream_id text,
  p_after_cursor bigint
)
RETURNS TABLE(
  stream_id text,
  sequence bigint,
  event_id uuid,
  idempotency_key text,
  kind text,
  payload jsonb,
  payload_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
  SELECT e.stream_id, e.sequence, e.event_id, c.idempotency_key, e.kind,
    e.payload, e.payload_sha256
  FROM process.control_event e
  JOIN process.control_command c USING (command_id)
  WHERE e.stream_id = p_stream_id AND e.sequence > p_after_cursor
  ORDER BY e.sequence
$function$;

CREATE OR REPLACE FUNCTION process.advance_control_cursor(
  p_consumer_id text,
  p_stream_id text,
  p_cursor bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
DECLARE
  maximum bigint;
  result bigint;
BEGIN
  SELECT COALESCE(max(sequence), 0) INTO maximum
  FROM process.control_event WHERE stream_id = p_stream_id;
  IF p_cursor > maximum THEN
    RAISE EXCEPTION 'CONTROL_CURSOR_AHEAD' USING ERRCODE = '22023';
  END IF;
  INSERT INTO process.control_cursor(consumer_id, stream_id, cursor)
  VALUES (p_consumer_id, p_stream_id, p_cursor)
  ON CONFLICT (consumer_id, stream_id) DO UPDATE SET
    cursor = GREATEST(process.control_cursor.cursor, EXCLUDED.cursor),
    updated_at = clock_timestamp()
  RETURNING cursor INTO result;
  RETURN result;
END
$function$;

CREATE OR REPLACE FUNCTION process.notify_control_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
BEGIN
  PERFORM pg_notify(
    'process_control_event',
    json_build_object('streamId', NEW.stream_id, 'sequence', NEW.sequence)::text
  );
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS control_event_notify ON process.control_event;
CREATE TRIGGER control_event_notify
AFTER INSERT ON process.control_event
FOR EACH ROW EXECUTE FUNCTION process.notify_control_event();

REVOKE ALL ON TABLE process.control_command, process.control_event,
  process.control_artifact, process.control_projection, process.control_cursor FROM PUBLIC;
REVOKE ALL ON FUNCTION process.append_control_command(uuid, text, text, text, jsonb, jsonb),
  process.register_control_artifact(uuid, uuid, text, text, text, bytea, text),
  process.read_control_events(text, bigint),
  process.advance_control_cursor(text, text, bigint) FROM PUBLIC;

GRANT USAGE ON SCHEMA process TO process_daemon;
GRANT EXECUTE ON FUNCTION process.append_control_command(uuid, text, text, text, jsonb, jsonb),
  process.register_control_artifact(uuid, uuid, text, text, text, bytea, text),
  process.read_control_events(text, bigint),
  process.advance_control_cursor(text, text, bigint)
  TO process_coordinator, process_daemon;
GRANT EXECUTE ON FUNCTION process.read_control_events(text, bigint)
  TO process_reader, process_preflight, process_judge;

COMMIT;
