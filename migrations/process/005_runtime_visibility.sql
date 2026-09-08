BEGIN;

CREATE TABLE IF NOT EXISTS process.runtime_visibility_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  cursor bigint NOT NULL DEFAULT 0 CHECK (cursor >= 0)
);

INSERT INTO process.runtime_visibility_state(singleton, cursor)
VALUES (true, 0)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS process.runtime_visibility_event (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id text NOT NULL UNIQUE CHECK (length(event_id) BETWEEN 1 AND 256),
  event_sha256 text NOT NULL CHECK (event_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  source text NOT NULL CHECK (source IN ('app-server', 'workflow', 'delegation', 'message')),
  kind text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9.-]{0,127}$'),
  agent_id text CHECK (agent_id IS NULL OR length(agent_id) BETWEEN 1 AND 256),
  item_id text CHECK (item_id IS NULL OR length(item_id) BETWEEN 1 AND 256),
  authoritative boolean NOT NULL,
  event jsonb NOT NULL CHECK (jsonb_typeof(event) = 'object' AND NOT event ? 'detail'),
  had_detail boolean NOT NULL,
  detail jsonb CHECK (
    detail IS NULL OR (
      jsonb_typeof(detail) = 'object'
      AND detail->>'type' IN ('message', 'command', 'tool')
      AND octet_length(convert_to(detail->>'body', 'UTF8')) <= 4096
    )
  ),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS runtime_visibility_agent_sequence_idx
  ON process.runtime_visibility_event(agent_id, sequence DESC);

CREATE TABLE IF NOT EXISTS process.runtime_visibility_summary (
  source text NOT NULL CHECK (source IN ('app-server', 'workflow', 'delegation', 'message')),
  summary_id text NOT NULL CHECK (length(summary_id) BETWEEN 1 AND 256),
  cursor bigint NOT NULL CHECK (cursor > 0),
  authoritative boolean NOT NULL,
  summary jsonb NOT NULL CHECK (jsonb_typeof(summary) = 'object' AND NOT summary ? 'detail'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (source, summary_id)
);

CREATE INDEX IF NOT EXISTS runtime_visibility_summary_cursor_idx
  ON process.runtime_visibility_summary(cursor);

CREATE OR REPLACE FUNCTION process.append_runtime_visibility(
  p_event jsonb,
  p_event_sha256 text,
  p_summary_id text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
DECLARE
  actor text := process.session_actor_role();
  existing process.runtime_visibility_event%ROWTYPE;
  inserted_sequence bigint;
  compact_event jsonb := p_event - 'detail';
  event_detail jsonb := p_event->'detail';
BEGIN
  IF actor NOT IN ('coordinator', 'daemon') THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_event ?| ARRAY['prompt', 'environment', 'reasoning', 'credentials'] THEN
    RAISE EXCEPTION 'VISIBILITY_EVENT_SENSITIVE' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing
  FROM process.runtime_visibility_event
  WHERE event_id = p_event->>'eventId';
  IF FOUND THEN
    IF existing.event_sha256 = p_event_sha256 THEN RETURN existing.sequence; END IF;
    RAISE EXCEPTION 'VISIBILITY_EVENT_CONFLICT' USING ERRCODE = '23505';
  END IF;

  INSERT INTO process.runtime_visibility_event(
    event_id, event_sha256, source, kind, agent_id, item_id, authoritative,
    event, had_detail, detail, occurred_at
  ) VALUES (
    p_event->>'eventId', p_event_sha256, p_event->>'source', p_event->>'kind',
    p_event->>'agentId', p_event->>'itemId', (p_event->>'authoritative')::boolean,
    compact_event, event_detail IS NOT NULL, event_detail,
    (p_event->>'occurredAt')::timestamptz
  ) RETURNING sequence INTO inserted_sequence;

  INSERT INTO process.runtime_visibility_summary(
    source, summary_id, cursor, authoritative, summary
  ) VALUES (
    p_event->>'source', p_summary_id, inserted_sequence,
    (p_event->>'authoritative')::boolean,
    compact_event || jsonb_build_object('id', p_summary_id, 'cursor', inserted_sequence::text)
  )
  ON CONFLICT (source, summary_id) DO UPDATE SET
    cursor = EXCLUDED.cursor,
    authoritative = EXCLUDED.authoritative,
    summary = EXCLUDED.summary,
    updated_at = clock_timestamp()
  WHERE EXCLUDED.authoritative OR NOT process.runtime_visibility_summary.authoritative;

  UPDATE process.runtime_visibility_state
  SET cursor = GREATEST(cursor, inserted_sequence)
  WHERE singleton;

  WITH pruned AS (
    SELECT sequence
    FROM process.runtime_visibility_event
    WHERE agent_id = p_event->>'agentId' AND detail IS NOT NULL
    ORDER BY sequence DESC
    OFFSET 100
  )
  UPDATE process.runtime_visibility_event
  SET detail = NULL
  WHERE sequence IN (SELECT sequence FROM pruned);

  RETURN inserted_sequence;
END
$function$;

CREATE OR REPLACE FUNCTION process.notify_runtime_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
BEGIN
  PERFORM pg_notify('process_runtime_visibility', NEW.sequence::text);
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS runtime_visibility_notify ON process.runtime_visibility_event;
CREATE TRIGGER runtime_visibility_notify
AFTER INSERT ON process.runtime_visibility_event
FOR EACH ROW EXECUTE FUNCTION process.notify_runtime_visibility();

REVOKE ALL ON TABLE process.runtime_visibility_state,
  process.runtime_visibility_event, process.runtime_visibility_summary FROM PUBLIC;
REVOKE ALL ON FUNCTION process.append_runtime_visibility(jsonb, text, text) FROM PUBLIC;

GRANT SELECT ON TABLE process.runtime_visibility_state,
  process.runtime_visibility_event, process.runtime_visibility_summary
  TO process_coordinator, process_daemon, process_reader, process_preflight, process_judge;
GRANT EXECUTE ON FUNCTION process.append_runtime_visibility(jsonb, text, text)
  TO process_coordinator, process_daemon;

COMMIT;
