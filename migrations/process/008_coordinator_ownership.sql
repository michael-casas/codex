BEGIN;

-- A coordinator is an authenticated daemon principal, never a synthetic runtime.
CREATE TABLE IF NOT EXISTS process.agent_principal (
  principal_id text PRIMARY KEY CHECK (principal_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'),
  kind text NOT NULL CHECK (kind IN ('runtime', 'coordinator'))
);
INSERT INTO process.agent_principal(principal_id, kind)
  SELECT agent_id, 'runtime' FROM process.agent_runtime ON CONFLICT DO NOTHING;
ALTER TABLE process.agent_runtime ADD COLUMN IF NOT EXISTS owner_principal_id text REFERENCES process.agent_principal(principal_id);
ALTER TABLE process.agent_runtime ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE process.agent_delegation ADD COLUMN IF NOT EXISTS owner_principal_id text REFERENCES process.agent_principal(principal_id);
ALTER TABLE process.agent_message DROP CONSTRAINT IF EXISTS agent_message_from_agent_id_fkey;
ALTER TABLE process.agent_message ADD CONSTRAINT agent_message_from_agent_id_fkey
  FOREIGN KEY (from_agent_id) REFERENCES process.agent_principal(principal_id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION process.ensure_agent_principal(p_id text, p_kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,process AS $function$
BEGIN
  IF process.session_actor_role() <> 'daemon' THEN RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  INSERT INTO process.agent_principal(principal_id,kind) VALUES(p_id,p_kind) ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM process.agent_principal WHERE principal_id=p_id AND kind=p_kind) THEN
    RAISE EXCEPTION 'PRINCIPAL_IDENTITY_CONFLICT' USING ERRCODE='23505';
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION process.runtime_principal_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,process AS $function$
BEGIN
  PERFORM process.ensure_agent_principal(NEW.agent_id,'runtime');
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS runtime_principal ON process.agent_runtime;
CREATE TRIGGER runtime_principal BEFORE INSERT ON process.agent_runtime FOR EACH ROW EXECUTE FUNCTION process.runtime_principal_trigger();

CREATE OR REPLACE FUNCTION process.register_owned_agent_runtime(p_agent text,p_host text,p_thread text,p_session text,p_owner text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,process AS $function$
DECLARE existing process.agent_runtime%ROWTYPE;
BEGIN
  IF process.session_actor_role() <> 'daemon' THEN RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('runtime:'||p_agent,0));
  SELECT * INTO existing FROM process.agent_runtime WHERE agent_id=p_agent;
  IF FOUND AND (existing.host_id,existing.thread_id,existing.session_id,existing.owner_principal_id)
    IS DISTINCT FROM (p_host,p_thread,p_session,p_owner) THEN
    RAISE EXCEPTION 'AGENT_OWNERSHIP_CONFLICT' USING ERRCODE='42501';
  END IF;
  PERFORM process.ensure_agent_principal(p_owner,'coordinator');
  INSERT INTO process.agent_runtime(agent_id,host_id,thread_id,session_id,owner_principal_id)
    VALUES(p_agent,p_host,p_thread,p_session,p_owner) ON CONFLICT DO NOTHING;
END $function$;

CREATE OR REPLACE FUNCTION process.reserve_owned_agent_delegation(p_command jsonb,p_fingerprint text,p_owner text)
RETURNS SETOF process.agent_delegation LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,process AS $function$
DECLARE reserved record;
BEGIN
  IF process.session_actor_role() <> 'daemon' THEN RAISE EXCEPTION 'PROCESS_ROLE_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT * INTO reserved FROM process.reserve_agent_delegation(p_command,p_fingerprint);
  IF reserved.replayed THEN
    IF NOT EXISTS(SELECT 1 FROM process.agent_delegation WHERE delegation_id=reserved.delegation_id AND owner_principal_id=p_owner) THEN
      RAISE EXCEPTION 'DELEGATION_OWNER_UNAUTHORIZED' USING ERRCODE='42501';
    END IF;
  ELSE
    PERFORM process.ensure_agent_principal(p_owner,'coordinator');
    UPDATE process.agent_delegation SET owner_principal_id=p_owner WHERE delegation_id=reserved.delegation_id;
  END IF;
  RETURN QUERY SELECT * FROM process.agent_delegation WHERE delegation_id=reserved.delegation_id;
END $function$;

CREATE OR REPLACE FUNCTION process.delegation_runtime_owner_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,process AS $function$
BEGIN
  IF NEW.owner_principal_id IS NOT NULL AND NEW.thread_id IS NOT NULL THEN
    PERFORM process.register_owned_agent_runtime(NEW.agent_id::text,NEW.host_id,NEW.thread_id,NEW.session_id,NEW.owner_principal_id);
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS delegation_runtime_owner ON process.agent_delegation;
CREATE TRIGGER delegation_runtime_owner AFTER UPDATE ON process.agent_delegation FOR EACH ROW EXECUTE FUNCTION process.delegation_runtime_owner_trigger();

CREATE OR REPLACE FUNCTION process.coordinator_owns_recipient(p_owner text,p_recipient text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,process AS $function$
  SELECT EXISTS(SELECT 1 FROM process.agent_runtime r JOIN process.agent_principal p ON p.principal_id=r.owner_principal_id
    WHERE r.agent_id=p_recipient AND p.principal_id=p_owner AND p.kind='coordinator')
$function$;

-- Defense in depth: the legacy submit function cannot bypass coordinator ownership.
CREATE OR REPLACE FUNCTION process.coordinator_message_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,process AS $function$
BEGIN
  IF EXISTS(SELECT 1 FROM process.agent_principal WHERE principal_id=NEW.from_agent_id AND kind='coordinator')
    AND NOT process.coordinator_owns_recipient(NEW.from_agent_id,NEW.to_agent_id) THEN
    RAISE EXCEPTION 'MESSAGE_UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS coordinator_message_guard ON process.agent_message;
CREATE TRIGGER coordinator_message_guard BEFORE INSERT ON process.agent_message FOR EACH ROW EXECUTE FUNCTION process.coordinator_message_guard();

REVOKE ALL ON process.agent_principal FROM PUBLIC;
REVOKE ALL ON FUNCTION process.ensure_agent_principal(text,text),process.runtime_principal_trigger(),
 process.register_owned_agent_runtime(text,text,text,text,text),process.reserve_owned_agent_delegation(jsonb,text,text),
 process.delegation_runtime_owner_trigger(),process.coordinator_owns_recipient(text,text),process.coordinator_message_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process.register_owned_agent_runtime(text,text,text,text,text),
 process.reserve_owned_agent_delegation(jsonb,text,text),process.coordinator_owns_recipient(text,text) TO process_daemon;
COMMIT;
