---
name: notion
description: Use when working with Notion via MCP or CLI, including reading/writing pages and databases, creating database views, modeling relations and rollups, and landing content in the right workspace/teamspace context. Prefer MCP for direct entity operations and CLI for scripting or batch workflows.
---

# Notion Skill

Use this skill when the task involves Notion content, Notion MCP, or the Notion CLI (`ntn`).

## Supporting files

- [`references/xlsx-to-notion.md`](references/xlsx-to-notion.md): workbook-to-Notion gotchas, placement rules, and the import workflow that worked for AES.
- [`scripts/import_xlsx_to_notion.py`](scripts/import_xlsx_to_notion.py): Python helper for extracting `.xlsx` rows and turning them into Notion payloads.

## Default split

- Use MCP for direct agent actions on specific pages, databases, comments, and workspace identity.
- Use CLI for scripting, orchestration, and repeatable shell-native workflows.

## Placement rules

- Do not assume a database can be created directly in a teamspace.
- A reliable landing target is a parent page that already lives inside the desired teamspace.
- If the task mentions a teamspace by name, first find the page anchor or wiki/database anchor that represents that space.

## Database modeling

- Prefer normalized databases over spreadsheet-shaped pages when the workbook encodes reusable entities.
- Use a separate Personnel database when the source data contains person records.
- Relate operational rows to people rows with a Notion relation property.
- Use rollups only for derived values, not as the primary source of truth.

## Views

- Treat views as presentation layers over the same underlying data.
- Use table views for operations, board views for workflow, calendar/timeline for scheduling, and gallery only when visual cards help.
- Add filters and quick filters to reduce clutter instead of duplicating databases.

## Practical workflow

1. Inspect the source shape first.
2. Decide whether the target is a page, database, or view.
3. Find the correct parent page if teamspace placement matters.
4. Create the database with a normalized schema.
5. Create useful views after the data model is right.
6. Add relations and rollups once the core tables exist.
7. For `.xlsx` imports, use the reference notes and script in this skill folder instead of ad hoc parsing.

## OPEN markers

- OPEN: Notion does not expose a direct `teamspace` parent in the API surface we observed. Confirm the best supported placement path in each new Notion version.
- OPEN: Verify whether the current MCP surface exposes views, relations, and update operations with the same richness as the CLI/API.
- OPEN: Confirm how teamspace membership and page sharing affect whether a newly created database lands in the desired sidebar location.
- OPEN: Determine the most reliable way to create or discover the parent page anchor for a named teamspace such as `Atlantis Electrical Systems`.
- OPEN: Keep the `.xlsx` import workflow updated when Notion CLI schema validation or data-source creation behavior changes.

## Agent phrasing

When instructing an agent, be explicit about:

- the target workspace or teamspace
- the intended parent page if known
- whether the task is direct Notion editing or scripting
- whether the desired output is a new database, a new view, or a relation model

## Good prompts

- "Use Notion MCP to create a draft page under the Atlantis Electrical Systems parent page."
- "Use the Notion CLI to script a batch import into the Job Board database."
- "Create a Personnel database and relate it to the Job Board rows."
