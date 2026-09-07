BEGIN;

CREATE TABLE IF NOT EXISTS process.agent_runtime (
  agent_id text PRIMARY KEY CHECK (length(agent_id) BETWEEN 1 AND 256),
  host_id text NOT NULL CHECK (length(host_id) BETWEEN 1 AND 256),
  thread_id text NOT NULL CHECK (length(thread_id) BETWEEN 1 AND 256),
  session_id text NOT NULL CHECK (length(session_id) BETWEEN 1 AND 256),
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (host_id, thread_id)
);

CREATE TABLE IF NOT EXISTS process.agent_message (
  message_id uuid PRIMARY KEY,
  correlation_id uuid NOT NULL,
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 1 AND 256),
  kind text NOT NULL CHECK (kind IN ('send', 'ask', 'reply')),
  from_agent_id text NOT NULL REFERENCES process.agent_runtime(agent_id) ON DELETE RESTRICT,
  to_agent_id text NOT NULL REFERENCES process.agent_runtime(agent_id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (octet_length(body) BETWEEN 1 AND 32768),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN (
    'queued', 'leased', 'app-server-accepted', 'thread-observed',
    'replied', 'failed', 'expired'
  )),
  marker text NOT NULL UNIQUE CHECK (marker ~ '^codex-message:[a-f0-9-]{36}$'),
  expires_at timestamptz,
  provider_turn_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (from_agent_id <> to_agent_id),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS agent_message_correlation_idx
  ON process.agent_message(correlation_id, created_at);
CREATE INDEX IF NOT EXISTS agent_message_recipient_idx
  ON process.agent_message(to_agent_id, created_at);

CREATE TABLE IF NOT EXISTS process.agent_message_outbox (
  message_id uuid PRIMARY KEY REFERENCES process.agent_message(message_id) ON DELETE RESTRICT,
  queue text NOT NULL DEFAULT 'agent-message',
  job_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION process.register_agent_runtime(
  p_agent_id text,
  p_host_id text,
  p_thread_id text,
  p_session_id text
)
RETURNS process.agent_runtime
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
DECLARE
  existing process.agent_runtime%ROWTYPE;
  result process.agent_runtime%ROWTYPE;
BEGIN
  IF process.session_actor_role() <> 'daemon' THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO existing FROM process.agent_runtime WHERE agent_id = p_agent_id;
  IF FOUND AND (existing.host_id, existing.thread_id, existing.session_id)
    IS DISTINCT FROM (p_host_id, p_thread_id, p_session_id) THEN
    RAISE EXCEPTION 'AGENT_RUNTIME_CONFLICT' USING ERRCODE = '23505';
  END IF;
  INSERT INTO process.agent_runtime(agent_id, host_id, thread_id, session_id)
  VALUES (p_agent_id, p_host_id, p_thread_id, p_session_id)
  ON CONFLICT (agent_id) DO UPDATE SET updated_at = clock_timestamp()
  RETURNING * INTO result;
  RETURN result;
END
$function$;

CREATE OR REPLACE FUNCTION process.submit_agent_message(
  p_idempotency_key text,
  p_kind text,
  p_from_agent_id text,
  p_to_agent_id text,
  p_body text,
  p_correlation_id uuid,
  p_expires_at timestamptz
)
RETURNS TABLE(message_id uuid, correlation_id uuid, state text, marker text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
DECLARE
  existing process.agent_message%ROWTYPE;
  next_message_id uuid := gen_random_uuid();
  next_correlation_id uuid := COALESCE(p_correlation_id, gen_random_uuid());
BEGIN
  IF process.session_actor_role() <> 'daemon' THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  SELECT * INTO existing FROM process.agent_message WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF (existing.kind, existing.from_agent_id, existing.to_agent_id, existing.body,
        existing.correlation_id, existing.expires_at)
      IS DISTINCT FROM (p_kind, p_from_agent_id, p_to_agent_id, p_body,
        COALESCE(p_correlation_id, existing.correlation_id), p_expires_at) THEN
      RAISE EXCEPTION 'MESSAGE_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT existing.message_id, existing.correlation_id,
      existing.state, existing.marker, true;
    RETURN;
  END IF;
  IF p_kind = 'reply' AND p_correlation_id IS NULL THEN
    RAISE EXCEPTION 'MESSAGE_CORRELATION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'reply' AND NOT EXISTS (
    SELECT 1
    FROM process.agent_message ask
    WHERE ask.correlation_id = p_correlation_id
      AND ask.kind = 'ask'
      AND ask.from_agent_id = p_to_agent_id
      AND ask.to_agent_id = p_from_agent_id
      AND ask.state NOT IN ('failed', 'expired')
  ) THEN
    RAISE EXCEPTION 'MESSAGE_CORRELATION_INVALID' USING ERRCODE = '22023';
  END IF;
  INSERT INTO process.agent_message(
    message_id, correlation_id, idempotency_key, kind, from_agent_id,
    to_agent_id, body, marker, expires_at
  ) VALUES (
    next_message_id, next_correlation_id, p_idempotency_key, p_kind,
    p_from_agent_id, p_to_agent_id, p_body,
    'codex-message:' || next_message_id::text, p_expires_at
  );
  INSERT INTO process.agent_message_outbox(message_id) VALUES (next_message_id);
  IF p_kind = 'reply' THEN
    UPDATE process.agent_message AS target
    SET state = 'replied', updated_at = clock_timestamp()
    WHERE target.correlation_id = next_correlation_id
      AND target.message_id <> next_message_id
      AND target.kind = 'ask'
      AND target.state NOT IN ('failed', 'expired');
  END IF;
  RETURN QUERY SELECT next_message_id, next_correlation_id, 'queued'::text,
    'codex-message:' || next_message_id::text, false;
END
$function$;

CREATE OR REPLACE FUNCTION process.read_pending_agent_messages(p_agent_id text)
RETURNS TABLE(
  message_id uuid, correlation_id uuid, kind text, from_agent_id text,
  to_agent_id text, body text, state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
  SELECT m.message_id, m.correlation_id, m.kind, m.from_agent_id,
    m.to_agent_id, m.body, m.state
  FROM process.agent_message m
  WHERE m.to_agent_id = p_agent_id
    AND m.state IN ('queued', 'leased', 'app-server-accepted', 'thread-observed')
  ORDER BY m.created_at, m.message_id
$function$;

CREATE OR REPLACE FUNCTION process.read_agent_message(p_message_id uuid)
RETURNS TABLE(
  message_id uuid, correlation_id uuid, kind text, from_agent_id text,
  to_agent_id text, body text, state text, marker text, expires_at timestamptz,
  host_id text, thread_id text, provider_turn_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
  SELECT m.message_id, m.correlation_id, m.kind, m.from_agent_id,
    m.to_agent_id, m.body, m.state, m.marker, m.expires_at,
    r.host_id, r.thread_id, m.provider_turn_id
  FROM process.agent_message m
  JOIN process.agent_runtime r ON r.agent_id = m.to_agent_id
  WHERE m.message_id = p_message_id
$function$;

CREATE OR REPLACE FUNCTION process.mark_agent_message(
  p_message_id uuid,
  p_state text,
  p_provider_turn_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
BEGIN
  IF process.session_actor_role() <> 'daemon' THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('queued', 'leased'),
      ('queued', 'app-server-accepted'),
      ('queued', 'thread-observed'),
      ('queued', 'replied'),
      ('queued', 'failed'),
      ('queued', 'expired'),
      ('leased', 'app-server-accepted'),
      ('leased', 'thread-observed'),
      ('leased', 'replied'),
      ('leased', 'failed'),
      ('leased', 'expired'),
      ('app-server-accepted', 'thread-observed'),
      ('app-server-accepted', 'replied'),
      ('app-server-accepted', 'failed'),
      ('app-server-accepted', 'expired'),
      ('thread-observed', 'replied'),
      ('thread-observed', 'failed'),
      ('thread-observed', 'expired')
    ) AS allowed(current_state, next_state)
    JOIN process.agent_message current_message
      ON current_message.message_id = p_message_id
    WHERE (current_message.state = p_state)
       OR (allowed.current_state = current_message.state
           AND allowed.next_state = p_state)
  ) THEN
    RAISE EXCEPTION 'MESSAGE_STATE_INVALID' USING ERRCODE = '22023';
  END IF;
  UPDATE process.agent_message
  SET state = p_state,
      provider_turn_id = COALESCE(p_provider_turn_id, provider_turn_id),
      updated_at = clock_timestamp()
  WHERE message_id = p_message_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MESSAGE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
END
$function$;

CREATE OR REPLACE FUNCTION process.attach_agent_message_job(
  p_message_id uuid,
  p_job_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
BEGIN
  IF process.session_actor_role() <> 'daemon' THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  UPDATE process.agent_message_outbox SET job_id = p_job_id
  WHERE message_id = p_message_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MESSAGE_OUTBOX_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
END
$function$;

CREATE OR REPLACE FUNCTION process.list_agent_runtimes()
RETURNS SETOF process.agent_runtime
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
  SELECT * FROM process.agent_runtime ORDER BY agent_id
$function$;

REVOKE ALL ON TABLE process.agent_runtime, process.agent_message,
  process.agent_message_outbox FROM PUBLIC;
REVOKE ALL ON FUNCTION process.register_agent_runtime(text, text, text, text),
  process.submit_agent_message(text, text, text, text, text, uuid, timestamptz),
  process.read_agent_message(uuid), process.mark_agent_message(uuid, text, text),
  process.attach_agent_message_job(uuid, uuid),
  process.read_pending_agent_messages(text),
  process.list_agent_runtimes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process.register_agent_runtime(text, text, text, text),
  process.submit_agent_message(text, text, text, text, text, uuid, timestamptz),
  process.read_agent_message(uuid), process.mark_agent_message(uuid, text, text),
  process.attach_agent_message_job(uuid, uuid),
  process.read_pending_agent_messages(text),
  process.list_agent_runtimes() TO process_daemon;
GRANT EXECUTE ON FUNCTION process.read_agent_message(uuid),
  process.read_pending_agent_messages(text), process.list_agent_runtimes()
  TO process_reader, process_preflight, process_judge;

COMMIT;
