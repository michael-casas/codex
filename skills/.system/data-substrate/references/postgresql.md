# PostgreSQL

Use PostgreSQL for durable relational state, transactions, constraints, joins, structured agent
records, audit trails, checkpoints, and metadata that must remain authoritative.

## Connection

Load `/Users/mcasa_atlantis/.codex/.env/codex-services.env`, then connect with
`$POSTGRES_URL`. The local endpoint is `127.0.0.1:5433`, database `codex`, user `codex`.

Without a host `psql` installation, run it inside the service:

```bash
docker compose --file /Users/mcasa_atlantis/.codex/docker-compose.yaml \
  exec -T postgres sh -ec \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## Operating rules

- Inspect schemas and migrations before adding tables.
- Use transactions for multi-step state changes.
- Add primary keys, constraints, and indexes deliberately.
- Namespace new schemas or tables by project/capability.
- Prefer migrations or idempotent DDL for durable project structures.
- Use parameterized queries from application code; never interpolate untrusted values.
- Do not drop or truncate shared structures without explicit authorization.

