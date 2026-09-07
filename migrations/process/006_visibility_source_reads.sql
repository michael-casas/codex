BEGIN;

-- Visibility reads only allowlisted display fields, never executable commands/prompts.
CREATE FUNCTION process.read_visibility_source_events(p_after bigint, p_limit integer)
RETURNS TABLE(sequence bigint, event_id uuid, stream_id text, kind text, payload jsonb, occurred_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, process
AS $function$
BEGIN
  IF process.session_actor_role() NOT IN ('daemon', 'coordinator') THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_after IS NULL OR p_after < 0 OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'VISIBILITY_SOURCE_QUERY_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT e.sequence, e.event_id, e.stream_id, e.kind,
    jsonb_strip_nulls(jsonb_build_object(
      'runId', e.payload->'runId', 'workflowRef', e.payload->'workflowRef',
      'nodeId', e.payload->'nodeId', 'diagnostic', left(e.payload->>'diagnostic',512),
      'code', e.payload->'code', 'node', CASE WHEN e.kind = 'node.frozen' THEN
        jsonb_build_object('id',e.payload#>'{node,id}','label',e.payload#>'{node,label}','phase',e.payload#>'{node,phase}') END,
      'observation', CASE WHEN e.kind = 'workflow.visibility.observed' THEN
        jsonb_build_object('kind',e.payload#>'{observation,kind}',
          'nodeId',e.payload#>'{observation,nodeId}', 'itemId',e.payload#>'{observation,itemId}',
          'detail', CASE WHEN e.payload#>'{observation,detail}' IS NOT NULL THEN
            jsonb_build_object('type',e.payload#>'{observation,detail,type}',
              'body',left(e.payload#>>'{observation,detail,body}',4096)) END) END
    )), e.recorded_at
  FROM process.control_event e
  WHERE e.sequence > p_after AND e.stream_id LIKE 'workflow:%'
  ORDER BY e.sequence LIMIT p_limit;
END
$function$;

CREATE FUNCTION process.read_visibility_delegations(p_after uuid, p_limit integer, p_only uuid DEFAULT NULL)
RETURNS TABLE(delegation_id uuid, agent_id uuid, thread_id text, state text, title text, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, process
AS $function$
BEGIN
  IF process.session_actor_role() NOT IN ('daemon', 'coordinator') THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'VISIBILITY_SOURCE_QUERY_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT d.delegation_id, d.agent_id, d.thread_id, d.state,
    left(d.command->>'assignmentRef', 255), d.updated_at
  FROM process.agent_delegation d
  WHERE (p_after IS NULL OR d.delegation_id > p_after) AND (p_only IS NULL OR d.delegation_id = p_only)
  ORDER BY d.delegation_id LIMIT p_limit;
END
$function$;

REVOKE ALL ON FUNCTION process.read_visibility_source_events(bigint,integer), process.read_visibility_delegations(uuid,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process.read_visibility_source_events(bigint,integer), process.read_visibility_delegations(uuid,integer,uuid) TO process_daemon, process_coordinator;
COMMIT;
