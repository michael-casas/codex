BEGIN;

ALTER TABLE process.agent_delegation
  ALTER COLUMN model DROP NOT NULL,
  ALTER COLUMN reasoning_effort DROP NOT NULL,
  ALTER COLUMN sandbox DROP NOT NULL,
  ALTER COLUMN approval_policy DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS ownership text NOT NULL DEFAULT 'managed';
ALTER TABLE process.agent_delegation DROP CONSTRAINT IF EXISTS agent_delegation_thread_id_key;
ALTER TABLE process.agent_delegation DROP CONSTRAINT IF EXISTS agent_delegation_ownership_check;
ALTER TABLE process.agent_delegation ADD CONSTRAINT agent_delegation_ownership_check CHECK (ownership IN ('managed','adopted'));
CREATE UNIQUE INDEX IF NOT EXISTS agent_delegation_host_thread_unique ON process.agent_delegation(host_id,thread_id) WHERE thread_id IS NOT NULL;

DROP FUNCTION IF EXISTS process.reserve_agent_delegation(jsonb,text);
CREATE FUNCTION process.reserve_agent_delegation(p_command jsonb, p_request_sha256 text)
RETURNS TABLE(delegation_id uuid, execution_id uuid, agent_id uuid, request_sha256 text, command jsonb, state text, workspace_ref text, thread_id text, session_id text, active_turn_id text, ownership text, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, process AS $function$
DECLARE existing process.agent_delegation%ROWTYPE; created process.agent_delegation%ROWTYPE;
BEGIN
  IF process.session_actor_role() <> 'daemon' THEN RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_command->>'idempotencyKey', 0));
  SELECT * INTO existing FROM process.agent_delegation d WHERE d.idempotency_key = p_command->>'idempotencyKey';
  IF FOUND THEN
    IF existing.request_sha256 <> p_request_sha256 THEN RAISE EXCEPTION 'DELEGATION_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
    RETURN QUERY SELECT existing.delegation_id, existing.execution_id, existing.agent_id, existing.request_sha256, existing.command, existing.state, existing.workspace_ref, existing.thread_id, existing.session_id, existing.active_turn_id, existing.ownership, true; RETURN;
  END IF;
  INSERT INTO process.agent_delegation(delegation_id, execution_id, agent_id, idempotency_key, request_sha256, command, assignment_digest, host_id, completion_boundary, model, reasoning_effort, sandbox, approval_policy, ownership)
  VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), p_command->>'idempotencyKey', p_request_sha256, p_command, p_command->>'assignmentDigest', p_command->>'hostId', p_command->>'completionBoundary', p_command#>>'{runtimeProfile,model}', p_command#>>'{runtimeProfile,reasoningEffort}', p_command#>>'{runtimeProfile,sandbox}', p_command#>>'{runtimeProfile,approvalPolicy}', CASE WHEN p_command ? 'existingThread' THEN 'adopted' ELSE 'managed' END) RETURNING * INTO created;
  RETURN QUERY SELECT created.delegation_id, created.execution_id, created.agent_id, created.request_sha256, created.command, created.state, created.workspace_ref, created.thread_id, created.session_id, created.active_turn_id, created.ownership, false;
END $function$;

CREATE OR REPLACE FUNCTION process.bind_agent_delegation(p_delegation_id uuid, p_workspace_ref text, p_thread_id text, p_session_id text, p_active_turn_id text)
RETURNS process.agent_delegation LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,process AS $function$
DECLARE result process.agent_delegation%ROWTYPE;
BEGIN
  IF process.session_actor_role() <> 'daemon' THEN RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  UPDATE process.agent_delegation SET workspace_ref=p_workspace_ref, thread_id=p_thread_id, session_id=p_session_id, active_turn_id=p_active_turn_id, ownership=CASE WHEN command ? 'existingThread' THEN 'adopted' ELSE 'managed' END, state='running', updated_at=clock_timestamp()
  WHERE delegation_id=p_delegation_id AND state IN ('reserved','ambiguous','running') RETURNING * INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'DELEGATION_NOT_BINDABLE' USING ERRCODE='P0002'; END IF; RETURN result;
END $function$;

DROP FUNCTION IF EXISTS process.read_visibility_delegations(uuid,integer,uuid);
CREATE FUNCTION process.read_visibility_delegations(p_after uuid, p_limit integer, p_only uuid DEFAULT NULL)
RETURNS TABLE(delegation_id uuid, agent_id uuid, thread_id text, state text, title text, ownership text, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, process AS $function$
BEGIN
  IF process.session_actor_role() NOT IN ('daemon', 'coordinator') THEN RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE = '42501'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN RAISE EXCEPTION 'VISIBILITY_SOURCE_QUERY_INVALID' USING ERRCODE = '22023'; END IF;
  RETURN QUERY SELECT d.delegation_id, d.agent_id, d.thread_id, d.state, left(d.command->>'assignmentRef',255), d.ownership, d.updated_at
  FROM process.agent_delegation d WHERE (p_after IS NULL OR d.delegation_id > p_after) AND (p_only IS NULL OR d.delegation_id = p_only)
  ORDER BY d.delegation_id LIMIT p_limit;
END $function$;

REVOKE ALL ON FUNCTION process.reserve_agent_delegation(jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION process.bind_agent_delegation(uuid,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION process.read_visibility_delegations(uuid,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process.reserve_agent_delegation(jsonb,text), process.bind_agent_delegation(uuid,text,text,text,text), process.read_visibility_delegations(uuid,integer,uuid) TO process_daemon;
GRANT EXECUTE ON FUNCTION process.read_visibility_delegations(uuid,integer,uuid) TO process_coordinator;
COMMIT;
