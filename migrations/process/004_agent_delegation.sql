BEGIN;

CREATE TABLE IF NOT EXISTS process.agent_delegation (
  delegation_id uuid PRIMARY KEY,
  execution_id uuid NOT NULL UNIQUE,
  agent_id uuid NOT NULL UNIQUE,
  idempotency_key text NOT NULL UNIQUE,
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  command jsonb NOT NULL CHECK (jsonb_typeof(command) = 'object'),
  assignment_digest text NOT NULL CHECK (assignment_digest ~ '^sha256:[a-f0-9]{64}$'),
  host_id text NOT NULL,
  completion_boundary text NOT NULL CHECK (completion_boundary IN ('runtime-settled','output-validated','ready-for-audit')),
  model text NOT NULL,
  reasoning_effort text NOT NULL,
  sandbox text NOT NULL,
  approval_policy text NOT NULL,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','running','blocked','runtime-settled','output-validated','ready-for-audit','ambiguous','failed','cancelled')),
  workspace_ref text,
  thread_id text UNIQUE,
  session_id text,
  active_turn_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION process.reserve_agent_delegation(p_command jsonb, p_request_sha256 text)
RETURNS TABLE(delegation_id uuid, execution_id uuid, agent_id uuid, request_sha256 text, command jsonb, state text, workspace_ref text, thread_id text, session_id text, active_turn_id text, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, process AS $function$
DECLARE existing process.agent_delegation%ROWTYPE; created process.agent_delegation%ROWTYPE;
BEGIN
  IF process.session_actor_role() <> 'daemon' THEN RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_command->>'idempotencyKey', 0));
  SELECT * INTO existing FROM process.agent_delegation d WHERE d.idempotency_key = p_command->>'idempotencyKey';
  IF FOUND THEN
    IF existing.request_sha256 <> p_request_sha256 THEN RAISE EXCEPTION 'DELEGATION_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
    RETURN QUERY SELECT existing.delegation_id, existing.execution_id, existing.agent_id, existing.request_sha256, existing.command, existing.state, existing.workspace_ref, existing.thread_id, existing.session_id, existing.active_turn_id, true; RETURN;
  END IF;
  INSERT INTO process.agent_delegation(delegation_id, execution_id, agent_id, idempotency_key, request_sha256, command, assignment_digest, host_id, completion_boundary, model, reasoning_effort, sandbox, approval_policy)
  VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), p_command->>'idempotencyKey', p_request_sha256, p_command, p_command->>'assignmentDigest', p_command->>'hostId', p_command->>'completionBoundary', p_command#>>'{runtimeProfile,model}', p_command#>>'{runtimeProfile,reasoningEffort}', p_command#>>'{runtimeProfile,sandbox}', p_command#>>'{runtimeProfile,approvalPolicy}') RETURNING * INTO created;
  RETURN QUERY SELECT created.delegation_id, created.execution_id, created.agent_id, created.request_sha256, created.command, created.state, created.workspace_ref, created.thread_id, created.session_id, created.active_turn_id, false;
END $function$;

CREATE OR REPLACE FUNCTION process.bind_agent_delegation(p_delegation_id uuid, p_workspace_ref text, p_thread_id text, p_session_id text, p_active_turn_id text)
RETURNS process.agent_delegation LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,process AS $function$
DECLARE result process.agent_delegation%ROWTYPE;
BEGIN
  IF process.session_actor_role() <> 'daemon' THEN RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  UPDATE process.agent_delegation SET workspace_ref=p_workspace_ref, thread_id=p_thread_id, session_id=p_session_id, active_turn_id=p_active_turn_id, state='running', updated_at=clock_timestamp()
  WHERE delegation_id=p_delegation_id AND state IN ('reserved','ambiguous','running') RETURNING * INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'DELEGATION_NOT_BINDABLE' USING ERRCODE='P0002'; END IF; RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION process.transition_agent_delegation(p_delegation_id uuid, p_state text, p_active_turn_id text DEFAULT NULL)
RETURNS process.agent_delegation LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,process AS $function$
DECLARE result process.agent_delegation%ROWTYPE;
BEGIN
  IF process.session_actor_role() <> 'daemon' THEN RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  UPDATE process.agent_delegation SET state=p_state, active_turn_id=COALESCE(p_active_turn_id,active_turn_id), updated_at=clock_timestamp() WHERE delegation_id=p_delegation_id RETURNING * INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'DELEGATION_NOT_FOUND' USING ERRCODE='P0002'; END IF; RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION process.read_agent_delegation(p_delegation_id uuid)
RETURNS process.agent_delegation LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,process AS $function$
  SELECT * FROM process.agent_delegation WHERE delegation_id=p_delegation_id
$function$;

REVOKE ALL ON process.agent_delegation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process.reserve_agent_delegation(jsonb,text), process.bind_agent_delegation(uuid,text,text,text,text), process.transition_agent_delegation(uuid,text,text), process.read_agent_delegation(uuid) TO process_daemon;
COMMIT;
