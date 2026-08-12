# Neo4j

Use Neo4j for knowledge graphs, dependency and provenance relationships, entity networks, path
finding, impact analysis, ownership graphs, and queries where traversal is the primary operation.

## Connection

Load `/Users/mcasa_atlantis/.codex/.env/codex-services.env`. Use `$NEO4J_URI`, `$NEO4J_USER`,
and `$NEO4J_PASSWORD`. The Bolt endpoint is `127.0.0.1:7687`; the browser is
`http://127.0.0.1:7474`; the default database is `codex`.

Without a host `cypher-shell` installation, run it inside the service:

```bash
docker compose --file /Users/mcasa_atlantis/.codex/docker-compose.yaml \
  exec -T neo4j sh -ec \
  'user="${NEO4J_AUTH%%/*}"; pass="${NEO4J_AUTH#*/}"; cypher-shell -u "$user" -p "$pass" -d codex'
```

## Operating rules

- Inspect existing labels, relationship types, indexes, and constraints first.
- Namespace labels or include a stable project property when sharing the database.
- Add uniqueness constraints for stable external identifiers.
- Use `MERGE` only with well-defined identity properties; avoid accidental graph fan-out.
- Parameterize Cypher from application code.
- Bound traversals and result counts during exploration.
- Do not run unbounded `DETACH DELETE` or remove shared constraints without explicit authorization.

