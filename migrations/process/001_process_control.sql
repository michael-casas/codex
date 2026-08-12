BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS process;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'process_coordinator') THEN
    CREATE ROLE process_coordinator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'process_preflight') THEN
    CREATE ROLE process_preflight NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'process_judge') THEN
    CREATE ROLE process_judge NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'process_reader') THEN
    CREATE ROLE process_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$roles$;

CREATE TABLE IF NOT EXISTS process.candidate (
  candidate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epoch text NOT NULL CHECK (epoch ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  workspace_root text NOT NULL CHECK (length(workspace_root) BETWEEN 1 AND 4096),
  base_revision text NOT NULL CHECK (length(base_revision) BETWEEN 7 AND 128),
  head_revision text NOT NULL CHECK (length(head_revision) BETWEEN 7 AND 128),
  candidate_digest text NOT NULL CHECK (candidate_digest ~ '^sha256:[a-f0-9]{64}$'),
  path_count integer NOT NULL CHECK (path_count > 0),
  algorithm jsonb NOT NULL CHECK (jsonb_typeof(algorithm) = 'object'),
  manifest bytea NOT NULL CHECK (octet_length(manifest) BETWEEN 2 AND 10485760),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (epoch, attempt_number),
  UNIQUE (candidate_digest, path_count),
  CHECK (
    manifest_sha256 = 'sha256:' || encode(public.digest(manifest, 'sha256'), 'hex')
  )
);

CREATE TABLE IF NOT EXISTS process.event (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  candidate_id uuid NOT NULL REFERENCES process.candidate(candidate_id) ON DELETE RESTRICT,
  actor_role text NOT NULL CHECK (actor_role IN ('coordinator', 'preflight', 'judge')),
  kind text NOT NULL CHECK (kind IN (
    'candidate.registered',
    'artifact.registered',
    'preflight.submitted',
    'verdict.submitted'
  )),
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 1 AND 256),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    payload_sha256 = 'sha256:' || encode(public.digest(convert_to(payload::text, 'UTF8'), 'sha256'), 'hex')
  )
);

CREATE TABLE IF NOT EXISTS process.artifact (
  artifact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES process.candidate(candidate_id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  source_path text NOT NULL CHECK (length(source_path) BETWEEN 1 AND 4096),
  media_type text NOT NULL CHECK (length(media_type) BETWEEN 1 AND 255),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 20971520),
  sha256 text NOT NULL CHECK (sha256 ~ '^sha256:[a-f0-9]{64}$'),
  registered_by text NOT NULL CHECK (registered_by IN ('coordinator', 'preflight', 'judge')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (candidate_id, kind, source_path, sha256),
  CHECK (sha256 = 'sha256:' || encode(public.digest(content, 'sha256'), 'hex'))
);

CREATE TABLE IF NOT EXISTS process.preflight (
  preflight_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES process.candidate(candidate_id) ON DELETE RESTRICT,
  requested_status text NOT NULL CHECK (requested_status IN ('valid', 'invalid')),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    evidence_sha256 = 'sha256:' || encode(public.digest(convert_to(evidence::text, 'UTF8'), 'sha256'), 'hex')
  )
);

CREATE TABLE IF NOT EXISTS process.verdict (
  verdict_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES process.candidate(candidate_id) ON DELETE RESTRICT,
  verdict text NOT NULL CHECK (verdict IN ('APPROVED', 'BLOCKED', 'ESCALATED')),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 5),
  blocking_violations integer NOT NULL CHECK (blocking_violations >= 0),
  report_artifact_id uuid NOT NULL REFERENCES process.artifact(artifact_id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS process.projection (
  candidate_id uuid PRIMARY KEY REFERENCES process.candidate(candidate_id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN (
    'registered',
    'preflight_invalid',
    'judgment_ready',
    'audit_approved',
    'audit_blocked',
    'audit_escalated'
  )),
  artifact_kinds text[] NOT NULL DEFAULT ARRAY[]::text[],
  last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  reducer_digest text NOT NULL CHECK (reducer_digest ~ '^sha256:[a-f0-9]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION process.jsonb_sha256(value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT 'sha256:' || encode(public.digest(convert_to(value::text, 'UTF8'), 'sha256'), 'hex')
$function$;

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
  IF pg_has_role(session_user, 'process_coordinator', 'member') THEN RETURN 'coordinator'; END IF;
  IF pg_has_role(session_user, 'process_reader', 'member') THEN RETURN 'reader'; END IF;
  RETURN 'unauthorized';
END
$function$;

CREATE OR REPLACE FUNCTION process.append_event(
  p_candidate_id uuid,
  p_actor_role text,
  p_kind text,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
DECLARE
  existing process.event%ROWTYPE;
  inserted_sequence bigint;
  payload_digest text := process.jsonb_sha256(p_payload);
BEGIN
  SELECT * INTO existing
  FROM process.event
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF existing.candidate_id = p_candidate_id
       AND existing.actor_role = p_actor_role
       AND existing.kind = p_kind
       AND existing.payload_sha256 = payload_digest THEN
      RETURN existing.sequence;
    END IF;
    RAISE EXCEPTION 'PROCESS_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
  END IF;

  INSERT INTO process.event(
    candidate_id, actor_role, kind, idempotency_key, payload, payload_sha256
  ) VALUES (
    p_candidate_id, p_actor_role, p_kind, p_idempotency_key, p_payload, payload_digest
  ) RETURNING sequence INTO inserted_sequence;
  RETURN inserted_sequence;
END
$function$;

CREATE OR REPLACE FUNCTION process.reduce_candidate(p_candidate_id uuid)
RETURNS process.projection
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
DECLARE
  candidate_row process.candidate%ROWTYPE;
  preflight_row process.preflight%ROWTYPE;
  verdict_row process.verdict%ROWTYPE;
  artifact_kinds text[];
  last_sequence bigint;
  next_state text := 'registered';
  projection_payload jsonb;
  result process.projection%ROWTYPE;
  gates_valid boolean := false;
  required_artifacts boolean := false;
BEGIN
  SELECT * INTO STRICT candidate_row
  FROM process.candidate
  WHERE candidate_id = p_candidate_id;

  SELECT COALESCE(array_agg(DISTINCT kind ORDER BY kind), ARRAY[]::text[])
  INTO artifact_kinds
  FROM process.artifact
  WHERE candidate_id = p_candidate_id;

  SELECT COALESCE(max(sequence), 0)
  INTO last_sequence
  FROM process.event
  WHERE candidate_id = p_candidate_id;

  SELECT * INTO preflight_row
  FROM process.preflight
  WHERE candidate_id = p_candidate_id;

  IF FOUND THEN
    required_artifacts := ARRAY[
      'candidate-manifest',
      'gate-manifest',
      'machine-tests',
      'cleanup-proof',
      'preflight-report'
    ]::text[] <@ artifact_kinds;

    gates_valid :=
      preflight_row.requested_status = 'valid'
      AND preflight_row.evidence->>'candidateDigest' = candidate_row.candidate_digest
      AND jsonb_typeof(preflight_row.evidence->'gates') = 'array'
      AND jsonb_array_length(preflight_row.evidence->'gates') > 0
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(preflight_row.evidence->'gates') AS gate
        WHERE COALESCE((gate->>'exitCode')::integer, -1) <> 0
           OR COALESCE((gate->>'selected')::integer, 0) <= 0
      )
      AND COALESCE((preflight_row.evidence->>'nativeTests')::integer, 0) > 0
      AND COALESCE((preflight_row.evidence->>'unexpectedResourceDelta')::integer, -1) = 0
      AND required_artifacts;

    next_state := CASE WHEN gates_valid THEN 'judgment_ready' ELSE 'preflight_invalid' END;
  END IF;

  SELECT * INTO verdict_row
  FROM process.verdict
  WHERE candidate_id = p_candidate_id;

  IF FOUND THEN
    IF next_state <> 'judgment_ready' THEN
      RAISE EXCEPTION 'PROCESS_JUDGMENT_NOT_READY' USING ERRCODE = 'P0001';
    END IF;
    next_state := CASE verdict_row.verdict
      WHEN 'APPROVED' THEN
        CASE WHEN verdict_row.score >= 4 AND verdict_row.blocking_violations = 0
          THEN 'audit_approved' ELSE 'audit_blocked' END
      WHEN 'BLOCKED' THEN 'audit_blocked'
      WHEN 'ESCALATED' THEN 'audit_escalated'
    END;
  END IF;

  projection_payload := jsonb_build_object(
    'artifactKinds', to_jsonb(artifact_kinds),
    'candidateDigest', candidate_row.candidate_digest,
    'lastSequence', last_sequence,
    'state', next_state
  );

  INSERT INTO process.projection(
    candidate_id, state, artifact_kinds, last_sequence, reducer_digest, updated_at
  ) VALUES (
    p_candidate_id,
    next_state,
    artifact_kinds,
    last_sequence,
    process.jsonb_sha256(projection_payload),
    clock_timestamp()
  )
  ON CONFLICT (candidate_id) DO UPDATE SET
    state = EXCLUDED.state,
    artifact_kinds = EXCLUDED.artifact_kinds,
    last_sequence = EXCLUDED.last_sequence,
    reducer_digest = EXCLUDED.reducer_digest,
    updated_at = EXCLUDED.updated_at
  RETURNING * INTO result;

  RETURN result;
END
$function$;

CREATE OR REPLACE FUNCTION process.register_candidate(
  p_epoch text,
  p_attempt_number integer,
  p_workspace_root text,
  p_base_revision text,
  p_head_revision text,
  p_candidate_digest text,
  p_path_count integer,
  p_algorithm jsonb,
  p_manifest bytea,
  p_manifest_sha256 text,
  p_idempotency_key text
)
RETURNS TABLE(candidate_id uuid, state text, reducer_digest text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
DECLARE
  candidate_uuid uuid;
  payload jsonb;
BEGIN
  IF process.session_actor_role() <> 'coordinator' THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT c.candidate_id INTO candidate_uuid
  FROM process.candidate c
  JOIN process.event e ON e.candidate_id = c.candidate_id
  WHERE e.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN QUERY
      SELECT p.candidate_id, p.state, p.reducer_digest
      FROM process.projection p
      WHERE p.candidate_id = candidate_uuid;
    RETURN;
  END IF;

  INSERT INTO process.candidate(
    epoch, attempt_number, workspace_root, base_revision, head_revision,
    candidate_digest, path_count, algorithm, manifest, manifest_sha256
  ) VALUES (
    p_epoch, p_attempt_number, p_workspace_root, p_base_revision, p_head_revision,
    p_candidate_digest, p_path_count, p_algorithm, p_manifest, p_manifest_sha256
  ) RETURNING process.candidate.candidate_id INTO candidate_uuid;

  payload := jsonb_build_object(
    'attemptNumber', p_attempt_number,
    'candidateDigest', p_candidate_digest,
    'epoch', p_epoch,
    'manifestSha256', p_manifest_sha256,
    'pathCount', p_path_count
  );
  PERFORM process.append_event(
    candidate_uuid, 'coordinator', 'candidate.registered', p_idempotency_key, payload
  );
  PERFORM process.reduce_candidate(candidate_uuid);

  RETURN QUERY
    SELECT p.candidate_id, p.state, p.reducer_digest
    FROM process.projection p
    WHERE p.candidate_id = candidate_uuid;
END
$function$;

CREATE OR REPLACE FUNCTION process.register_artifact(
  p_candidate_id uuid,
  p_kind text,
  p_source_path text,
  p_media_type text,
  p_content bytea,
  p_sha256 text,
  p_idempotency_key text
)
RETURNS TABLE(artifact_id uuid, state text, reducer_digest text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
DECLARE
  actor text := process.session_actor_role();
  artifact_uuid uuid;
  payload jsonb;
BEGIN
  IF actor NOT IN ('coordinator', 'preflight', 'judge') THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF actor = 'judge' AND p_kind <> 'audit-report' THEN
    RAISE EXCEPTION 'PROCESS_ARTIFACT_KIND_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF actor = 'coordinator' AND p_kind NOT IN ('candidate-manifest', 'assignment', 'green-contract') THEN
    RAISE EXCEPTION 'PROCESS_ARTIFACT_KIND_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT a.artifact_id INTO artifact_uuid
  FROM process.artifact a
  JOIN process.event e ON e.candidate_id = a.candidate_id
  WHERE e.idempotency_key = p_idempotency_key
    AND a.candidate_id = p_candidate_id
    AND a.kind = p_kind
    AND a.sha256 = p_sha256;

  IF NOT FOUND THEN
    INSERT INTO process.artifact(
      candidate_id, kind, source_path, media_type, content, sha256, registered_by
    ) VALUES (
      p_candidate_id, p_kind, p_source_path, p_media_type, p_content, p_sha256, actor
    ) RETURNING process.artifact.artifact_id INTO artifact_uuid;

    payload := jsonb_build_object(
      'artifactId', artifact_uuid,
      'kind', p_kind,
      'mediaType', p_media_type,
      'sha256', p_sha256,
      'size', octet_length(p_content),
      'sourcePath', p_source_path
    );
    PERFORM process.append_event(
      p_candidate_id, actor, 'artifact.registered', p_idempotency_key, payload
    );
  END IF;

  PERFORM process.reduce_candidate(p_candidate_id);
  RETURN QUERY
    SELECT artifact_uuid, p.state, p.reducer_digest
    FROM process.projection p
    WHERE p.candidate_id = p_candidate_id;
END
$function$;

CREATE OR REPLACE FUNCTION process.submit_preflight(
  p_candidate_id uuid,
  p_requested_status text,
  p_evidence jsonb,
  p_idempotency_key text
)
RETURNS TABLE(preflight_id uuid, state text, reducer_digest text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
DECLARE
  preflight_uuid uuid;
  payload jsonb;
BEGIN
  IF process.session_actor_role() <> 'preflight' THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO process.preflight(
    candidate_id, requested_status, evidence, evidence_sha256
  ) VALUES (
    p_candidate_id, p_requested_status, p_evidence, process.jsonb_sha256(p_evidence)
  ) RETURNING process.preflight.preflight_id INTO preflight_uuid;

  payload := jsonb_build_object(
    'evidenceSha256', process.jsonb_sha256(p_evidence),
    'requestedStatus', p_requested_status
  );
  PERFORM process.append_event(
    p_candidate_id, 'preflight', 'preflight.submitted', p_idempotency_key, payload
  );
  PERFORM process.reduce_candidate(p_candidate_id);

  RETURN QUERY
    SELECT preflight_uuid, p.state, p.reducer_digest
    FROM process.projection p
    WHERE p.candidate_id = p_candidate_id;
END
$function$;

CREATE OR REPLACE FUNCTION process.submit_verdict(
  p_candidate_id uuid,
  p_verdict text,
  p_score integer,
  p_blocking_violations integer,
  p_report_artifact_id uuid,
  p_idempotency_key text
)
RETURNS TABLE(verdict_id uuid, state text, reducer_digest text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
DECLARE
  verdict_uuid uuid;
  payload jsonb;
  current_state text;
BEGIN
  IF process.session_actor_role() <> 'judge' THEN
    RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT p.state INTO current_state
  FROM process.projection p
  WHERE p.candidate_id = p_candidate_id;
  IF current_state <> 'judgment_ready' THEN
    RAISE EXCEPTION 'PROCESS_JUDGMENT_NOT_READY' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO process.verdict(
    candidate_id, verdict, score, blocking_violations, report_artifact_id
  ) VALUES (
    p_candidate_id, p_verdict, p_score, p_blocking_violations, p_report_artifact_id
  ) RETURNING process.verdict.verdict_id INTO verdict_uuid;

  payload := jsonb_build_object(
    'blockingViolations', p_blocking_violations,
    'reportArtifactId', p_report_artifact_id,
    'score', p_score,
    'verdict', p_verdict
  );
  PERFORM process.append_event(
    p_candidate_id, 'judge', 'verdict.submitted', p_idempotency_key, payload
  );
  PERFORM process.reduce_candidate(p_candidate_id);

  RETURN QUERY
    SELECT verdict_uuid, p.state, p.reducer_digest
    FROM process.projection p
    WHERE p.candidate_id = p_candidate_id;
END
$function$;

CREATE OR REPLACE FUNCTION process.read_candidate_status(p_candidate_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, process
AS $function$
  SELECT jsonb_build_object(
    'artifactKinds', to_jsonb(p.artifact_kinds),
    'attemptNumber', c.attempt_number,
    'candidateDigest', c.candidate_digest,
    'candidateId', c.candidate_id,
    'epoch', c.epoch,
    'lastSequence', p.last_sequence,
    'reducerDigest', p.reducer_digest,
    'state', p.state
  )
  FROM process.candidate c
  JOIN process.projection p USING (candidate_id)
  WHERE c.candidate_id = p_candidate_id
$function$;

REVOKE ALL ON SCHEMA process FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA process FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA process FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA process FROM PUBLIC;

GRANT USAGE ON SCHEMA process TO
  process_coordinator, process_preflight, process_judge, process_reader;

GRANT EXECUTE ON FUNCTION process.register_candidate(
  text, integer, text, text, text, text, integer, jsonb, bytea, text, text
) TO process_coordinator;
GRANT EXECUTE ON FUNCTION process.register_artifact(
  uuid, text, text, text, bytea, text, text
) TO process_coordinator, process_preflight, process_judge;
GRANT EXECUTE ON FUNCTION process.submit_preflight(
  uuid, text, jsonb, text
) TO process_preflight;
GRANT EXECUTE ON FUNCTION process.submit_verdict(
  uuid, text, integer, integer, uuid, text
) TO process_judge;
GRANT EXECUTE ON FUNCTION process.read_candidate_status(uuid) TO
  process_coordinator, process_preflight, process_judge, process_reader;

COMMIT;
