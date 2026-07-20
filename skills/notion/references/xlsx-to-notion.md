# .xlsx to Notion

## What worked

- Read the workbook structure first instead of assuming a flat table.
- Treat spreadsheet tabs as either source entities or operational views.
- For AES, the `AES Directory` tab mapped cleanly to a separate `Personnel` database.
- Land the target under an existing page inside the desired teamspace, rather than trying to create directly in the teamspace boundary.
- Create the database first, then patch the data source schema, then import rows.
- Use the Notion CLI for batch work and Python for workbook parsing.

## Gotchas

- Excel row numbers are not real data; ignore index-only columns when mapping fields.
- Workbook columns can be shifted or sparse. Read actual cell addresses before building the payload.
- Excel date serials need conversion to ISO dates before sending to Notion.
- Notion CLI validation is strict about property names. Match the live data source schema exactly.
- A database can exist before its data source schema is fully expanded.
- Teamspace placement is usually a parent-page problem, not a direct `teamspace` field problem.

## Workflow used successfully

1. Inspect workbook sheets and identify the source entity tab.
2. Decode headers and actual populated columns from the XLSX XML.
3. Find the real Notion parent page using search or MCP.
4. Create the database under that parent page with a minimal schema.
5. Patch the data source to add the complete property set.
6. Import rows with a Python loop that calls `ntn api /v1/pages`.
7. Query the data source back to verify the row count and sample records.

## Practical pattern

- Use MCP when you need live workspace/page identity or to inspect existing objects.
- Use the CLI when you need repeatable imports, searches, or batch mutations.
- Use Python when the source workbook needs transformation before the Notion payload is built.
