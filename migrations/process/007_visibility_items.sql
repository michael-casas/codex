BEGIN;

-- Evaluation projection only. Existing events/history are not removed.
ALTER TABLE process.runtime_visibility_event ADD COLUMN item_payload jsonb;
ALTER TABLE process.runtime_visibility_event ADD CONSTRAINT runtime_visibility_item_payload_bound
  CHECK (item_payload IS NULL OR (jsonb_typeof(item_payload)='object' AND octet_length(item_payload::text)<=524288));

CREATE TABLE process.runtime_visibility_item (
  item_id text PRIMARY KEY CHECK (item_id ~ '^item:[a-f0-9]{64}$'),
  agent_id text NOT NULL,
  revision bigint NOT NULL REFERENCES process.runtime_visibility_event(sequence),
  first_revision bigint NOT NULL,
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=524288),
  CHECK(first_revision>0 AND revision>=first_revision)
);
CREATE INDEX runtime_visibility_item_agent_revision_idx ON process.runtime_visibility_item(agent_id,revision DESC);

CREATE FUNCTION process.append_visibility_item_event(p_event jsonb,p_sha text,p_summary_id text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,process
AS $function$
DECLARE position bigint;
BEGIN
  IF process.session_actor_role() NOT IN ('daemon','coordinator') THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_event->'item') IS DISTINCT FROM 'object'
     OR octet_length((p_event->'item')::text)>524288
     OR COALESCE(p_event#>>'{item,id}','') !~ '^item:[a-f0-9]{64}$'
     OR COALESCE(p_event->>'agentId','')=''
     OR p_event#>>'{item,itemId}' IS DISTINCT FROM p_event->>'itemId' THEN
    RAISE EXCEPTION 'VISIBILITY_ITEM_INVALID' USING ERRCODE='22023';
  END IF;
  -- The existing append owns event idempotency and global cursor ordering. Strip
  -- item content so it cannot leak through all-agent summary responses.
  position:=process.append_runtime_visibility(p_event-'item',p_sha,p_summary_id);
  UPDATE process.runtime_visibility_event SET item_payload=p_event->'item'
    WHERE sequence=position AND item_payload IS NULL;
  RETURN position;
END
$function$;

CREATE FUNCTION process.store_visible_item(p_revision bigint,p_snapshot jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,process
AS $function$
DECLARE source process.runtime_visibility_event%ROWTYPE;
BEGIN
  IF process.session_actor_role() NOT IN ('daemon','coordinator') THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT source FROM process.runtime_visibility_event WHERE sequence=p_revision;
  IF source.item_payload IS NULL OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
    OR octet_length(p_snapshot::text)>524288
    OR octet_length(convert_to(COALESCE(p_snapshot->>'body',''),'UTF8'))>65536
    OR p_snapshot->>'id' IS DISTINCT FROM source.item_payload->>'id'
    OR p_snapshot->>'agentId' IS DISTINCT FROM source.agent_id
    OR p_snapshot->>'threadId' IS DISTINCT FROM source.item_payload->>'threadId'
    OR p_snapshot->>'turnId' IS DISTINCT FROM source.item_payload->>'turnId'
    OR p_snapshot->>'itemId' IS DISTINCT FROM source.item_payload->>'itemId'
    OR p_snapshot->>'revision' IS DISTINCT FROM p_revision::text THEN
    RAISE EXCEPTION 'VISIBILITY_ITEM_INVALID' USING ERRCODE='22023';
  END IF;
  INSERT INTO process.runtime_visibility_item(item_id,agent_id,revision,first_revision,snapshot)
    VALUES(p_snapshot->>'id',source.agent_id,p_revision,(p_snapshot->>'firstRevision')::bigint,p_snapshot)
  ON CONFLICT(item_id) DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot
    WHERE process.runtime_visibility_item.revision<EXCLUDED.revision;
END
$function$;

CREATE OR REPLACE FUNCTION process.read_visibility_source_events(p_after bigint,p_limit integer)
RETURNS TABLE(sequence bigint,event_id uuid,stream_id text,kind text,payload jsonb,occurred_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,process
AS $function$
BEGIN
  IF process.session_actor_role() NOT IN ('daemon','coordinator') THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF p_after IS NULL OR p_after<0 OR p_limit IS NULL OR p_limit<1 OR p_limit>1000 THEN
    RAISE EXCEPTION 'VISIBILITY_SOURCE_QUERY_INVALID' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT e.sequence,e.event_id,e.stream_id,e.kind,
    jsonb_strip_nulls(jsonb_build_object(
      'runId',e.payload->'runId','workflowRef',e.payload->'workflowRef',
      'display',CASE WHEN jsonb_typeof(e.payload->'display')='object' THEN
        jsonb_build_object('id',e.payload#>'{display,id}','title',left(e.payload#>>'{display,title}',512)) END,
      'nodeId',e.payload->'nodeId','diagnostic',left(e.payload->>'diagnostic',512),'code',e.payload->'code',
      'node',CASE WHEN e.kind='node.frozen' THEN jsonb_build_object('id',e.payload#>'{node,id}','label',e.payload#>'{node,label}','phase',e.payload#>'{node,phase}') END,
      'observation',CASE WHEN e.kind='workflow.visibility.observed' THEN jsonb_build_object(
        'kind',e.payload#>'{observation,kind}','nodeId',e.payload#>'{observation,nodeId}',
        'itemId',e.payload#>'{observation,itemId}','item',e.payload#>'{observation,item}',
        'detail',CASE WHEN e.payload#>'{observation,detail}' IS NOT NULL THEN jsonb_build_object(
          'type',e.payload#>'{observation,detail,type}','body',left(e.payload#>>'{observation,detail,body}',4096),
          'truncated',e.payload#>'{observation,detail,truncated}','originalBytes',e.payload#>'{observation,detail,originalBytes}') END) END
    )),e.recorded_at FROM process.control_event e
    WHERE e.sequence>p_after AND e.stream_id LIKE 'workflow:%' ORDER BY e.sequence LIMIT p_limit;
END
$function$;

REVOKE ALL ON process.runtime_visibility_item FROM PUBLIC;
GRANT SELECT ON process.runtime_visibility_item TO process_daemon,process_coordinator;
REVOKE ALL ON FUNCTION process.append_visibility_item_event(jsonb,text,text),process.store_visible_item(bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process.append_visibility_item_event(jsonb,text,text),process.store_visible_item(bigint,jsonb) TO process_daemon,process_coordinator;
REVOKE ALL ON FUNCTION process.read_visibility_source_events(bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process.read_visibility_source_events(bigint,integer) TO process_daemon,process_coordinator;
COMMIT;
