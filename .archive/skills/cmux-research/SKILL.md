---
name: cmux-research
description: Delegate codebase research to the Researcher - pi surface in the current cmux workspace instead of searching directly. Use when the task requires implementation discovery, cross-seam integration mapping, file inventory, dependency tracing, schema/contract surveys, or any "find what's there" recon. Researcher - pi runs deepseek-v4-flash on opencode-go (cheap, fast, read-only), may fan out across multiple research topics or downstream surfaces, and writes a structured report to `./.agent/reports/`. Never research directly — invoke this skill and dispatch.
---

# cmux Research — Delegate, Don't Search

This skill encodes the project's standing rule:

> **Never directly search through the project for implementation, code, cross-seam
> integration, etc. Always invoke the `cmux-research` skill and dispatch to the
> `Researcher - pi` surface in your current cmux workspace.**

`Researcher - pi` runs a cheap frontier-class model (`deepseek-v4-flash` on
`opencode-go`) optimized for read-only recon. Treat it as a **research
orchestrator**, not just a single worker. It can receive one charter and fan out
that charter into multiple research topics or downstream surfaces when the task
warrants it. It returns a structured report. You read the report. You never run
rg / grep / find / read_file / search_files in anger when `Researcher - pi` can
do it cheaper, faster, and with a written trail.

---

## Why this exists

1. **Token economy.** A Sonnet / Opus / GPT-5.5 run costs real money. `Researcher - pi`
   recon is cheap. Spawning it for "find all consumers of Meta.contract" instead of
   running 50 search_files calls in your own context saves the expensive model for
   the design decisions that need it.
2. **Audit trail.** Every research dispatch writes a report to `./.agent/reports/`.
   Future agents can read prior reports before re-researching. Direct searches leave
   no trace.
3. **Parallelism.** While you wait for the report (1-3 min typically), you can be
   drafting the next move. Direct search blocks your turn.
4. **Quality.** dsv4 - pi is calibrated for recon. Its reports are dense, cited
   (file:line), and structured. Your own searches get summarized into prose that
   you then re-process.

---

## When to use this skill

Use it for **any** of the following:

- "Find all consumers of `<X>`."
- "What does `<Y>` do? Where is it called from?"
- "Survey the `<Z>` directory and tell me what's there."
- "Trace how `<Foo>` flows through `<Bar>` to `<Baz>`."
- "What's the schema for `<Contract>`? What fields exist? Who uses them?"
- "Are there competing / duplicate implementations of `<Concept>`?"
- "Map the dependency graph between `<Layer A>` and `<Layer B>`."

**Do not use** this skill for:

- Code edits (use `codex` / opencode edit surface directly).
- Design decisions (those are your job — the orchestrator's).
- Reading a single known file you already have the path to (just read it).
- Looking up a one-line symbol definition (just search once inline).

Rule of thumb: if your task involves more than ~3 search/read calls, dispatch.
If it's 1-2 lookups, do it inline and move on.

---

## The 5-step dispatch protocol

### Step 1: Find your current workspace's Researcher - pi surface

```bash
# List all workspaces with surfaces named "Researcher - pi"
cmux tree --all 2>&1 | grep -B2 "Researcher - pi"
```

Output looks like:
```
├── workspace workspace:2 "Active Worktree | iqne" [selected] ◀ active
│   └── pane pane:2 [focused] ◀ active
│       └── ...
│       ├── surface surface:24 [terminal] "Researcher - pi"
│       ├── ...
```

**Capture the `workspace:N` and `surface:N` refs.** Use refs (not numeric indices)
to dodge 0-based / 1-based conversion bugs.

If your workspace has no `Researcher - pi` surface, **launch one** in the current
workspace before proceeding:

```bash
cmux new-surface
cmux rename-tab --surface 'surface:N' "Researcher - pi"
cmux send --surface 'surface:N' "pi --model opencode-go/deepseek-v4-flash"
cmux send-key --surface 'surface:N' Return
```

Then continue with the normal idle/read-screen checks. Do not fall back to an
arbitrary surface if the dedicated research surface is missing.

### Step 2: Verify the surface is idle (Reflex 1)

```bash
cmux read-screen --workspace 'workspace:N' --surface 'surface:N' 2>&1 | tail -30
```

Look for an empty `❯` prompt, no spinner, status bar shows idle model name.
**Do not skip this.** Sending text to a busy surface appends it as a mid-conversation
user turn and corrupts the recon.

### Step 3: Write the charter to disk (path-reference, not inline)

Write the charter to `<worktree>/.agent/reports/<topic>-charter.md`. `Researcher - pi`
appends its report below the charter.

**Charter template:**

```markdown
# Charter: <Recon topic>

**Tier:** T1 — deepseek-v4-flash (Researcher - pi), read-only recon
**Surface:** surface:N ("Researcher - pi") in workspace:N ("<workspace name>")
**Mode:** Read-only. No file edits. No code changes.

---

## Mission

<One paragraph: what you need to find out.>

If the problem naturally splits into multiple subtopics, you may instruct
Researcher - pi to fan out the work across multiple research threads or
downstream surfaces and synthesize the result back into one report.

---

## Inputs

- Worktree root: <absolute path>
- Prior reports to cross-reference (if any): <paths>

---

## What to find

<Bullet list of specific questions, with "cite file:line for every claim" reminder.>

---

## Constraints

- Read-only. No edits. No git ops.
- Use ripgrep (`rg`), not grep/find. Repo is large.
- Cite file:line for every claim.
- Token budget: ≤ 4 KB output. Tables preferred over prose.

---

## Output format

Append `## RECON REPORT` below this charter with these sections:

### 1. <Inventory table or list>
### 2. <Cross-reference table>
### 3. <Surprises / unexpected findings>
### 4. <Open questions for the orchestrator>

---

## Definition of Done

- `## RECON REPORT` section appended below.
- Total recon section ≤ 4 KB.
- File:line citations on every claim.
- No speculation — "none found" + the rg command you ran.

---

*Begin.*
```

### Step 4: Send the path-reference prompt + Return (Reflex 2 + 4)

```bash
# Path-reference prompt (always short — full charter is on disk)
cmux send --workspace 'workspace:N' --surface 'surface:N' \
  'read <absolute path to charter> and execute exactly as written, appending the RECON REPORT below. Token budget ≤ 4 KB. Cite file:line for every claim.'

# Submit
cmux send-key --workspace 'workspace:N' --surface 'surface:N' Return
```

**Critical pair:** every `cmux send` MUST be paired with `cmux send-key Return` in
the same dispatch cycle. Without Return, the text sits in the buffer and nothing
happens.

### Step 5: Wait for the report

Researcher - pi typically finishes in 1-3 minutes. While you wait:

- **Do NOT poll sleep loops.** Set up an event-driven wake (Hermes kanban
  substrate, or `hermes-kanban-wake.py --task-id <id>`) if your runtime supports it.
- **Do NOT send key interrupts** (ctrl+c, Escape, Backspace) to the busy surface.
- **Do read other files / plan next moves** in parallel.

When the report lands, **verify the path before trusting the content**:

```bash
ls -la <worktree>/.agent/reports/<topic>-charter.md
```

If the path is empty or stale, search for the report:

```bash
find <worktree>/.agent/reports -name '*.md' -newer <charter-write-time> 2>/dev/null
```

**If the file is unchanged from the charter** (line count = charter size, ends at `*Begin.*`),
the agent reported in scrollback but the write_file call did not execute. This is a real
failure mode — agents can finish reasoning, print a summary to the terminal, and exit
without ever calling the file-write tool. Don't trust the scrollback summary alone.

**Correction pattern**: re-prompt with explicit write-back instruction:

> "CORRECTION: The recon did not land. The file `<path>` ends at `*Begin.*`. ACTION:
> use write_file to append the REPORT to that exact file path. After writing, run
> `wc -l` to verify the file grew, then report the verified line count."

The agent already has the context (it did the recon). Re-running the rg pass is wasteful;
the write-back instruction is what was missing.

**Worse-case fallback**: if the second dispatch also fails, run the recon inline
yourself. The agent's scrollback findings are usually accurate — verify with one or
two rg commands and write the report directly. Better to spend 30s of M3 context
than re-burn a T1 dispatch.

---

## Reporting back to the user / orchestrator

Once you have the report:

1. **Read it yourself first.** Surface-level header checks are insufficient. The
   orchestrator will ask "what did you find?" — answer with substance, not
   "report exists at PATH."
2. **Surface surprises loudly.** If dsv4 - pi found something the user didn't
   expect (a third builder, a competing implementation, a dead module), that's
   the load-bearing finding. Lead with it.
3. **Cite file:line in your reply.** Don't paraphrase the recon — the citations
   are the proof.

---

## The 5 reflexes (must remember)

From `cmux-dispatch-protocol`:

1. **Read-screen-before-send** — verify idle.
2. **Send-key-Return after every send** — text in buffer ≠ submitted.
3. **Use `workspace:N/surface:N` refs** — not numeric indices.
4. **Path-reference, not inline** — charters on disk, prompt is a path.
5. **No-key-interrupt-while-generating** — never ctrl+c / Escape to a busy surface.

Plus one Researcher - pi-specific reflex:

6. **Verify report path before trusting content** — `ls -la` the report file.

---

**No length cap on Codex output.** Length should match the substance of the work.
Forcing shorter output (≤ N KB) forces compaction and re-apply cycles — each compaction
costs more than the bytes saved. (2026-06-22 incident: charter "≤ 14 KB" on a 9-question
design decision caused multiple compactions and worse net output than letting Codex
write the 25-40 KB the work actually demanded.) Token-budget language in recon
charters is removed; match length to substance instead.

---

## Anti-patterns

- ❌ **Capping output bytes on a resolution charter** ("≤ 14 KB", "be dense"). Forcing
  the model to fit a complex decision under a self-imposed cap causes compaction cycles,
  dropped sections, and re-apply passes. Net cost goes up, quality goes down. (See the
  incident note in the no-length-cap rule above.)
- ❌ Running `rg` directly because "it's faster than dispatching" — false economy.
  Dispatching is 1-3 min; running 30 searches in your context is more tokens than
  the recon itself.
- ❌ Dispatching to Opus / Sonnet / GPT-5.5 for recon — burns the wrong tier.
  `Researcher - pi` exists for this.
- ❌ Inline prompts > 2-3 lines — choke on newlines, backticks, shell chars.
  Always path-reference.
- ❌ Skipping `cmux read-screen` — sends land in mid-conversation, corrupt context.
- ❌ Forgetting `cmux send-key Return` — text sits in buffer, nothing happens.
- ❌ Polling `cmux read-screen` in a sleep loop — block your turn for nothing.
  Use event-driven wake if available.
- ❌ Trusting an agent-reported path without `ls -la` — phantom worktrees,
  path drift between worktrees, missing files all happen.

---

## Example dispatch (full cycle)

```bash
# 1. Find the Researcher - pi surface
SURFACE=$(cmux tree --all 2>&1 | grep -B2 "Researcher - pi" | grep -oE 'surface:[0-9]+' | head -1)
WORKSPACE=$(cmux tree --all 2>&1 | grep -B5 "Researcher - pi" | grep -oE 'workspace:[0-9]+' | head -1)

# 2. Verify idle
cmux read-screen --workspace "$WORKSPACE" --surface "$SURFACE" 2>&1 | tail -20

# 3. Write charter (use write_file tool or heredoc)
write_file /path/to/.agent/reports/r7-meta-recon-charter.md "<charter content>"

# 4. Send + Return
cmux send --workspace "$WORKSPACE" --surface "$SURFACE" \
  'read /path/to/.agent/reports/r7-meta-recon-charter.md and execute exactly as written, appending the RECON REPORT below. Token budget ≤ 4 KB. Cite file:line for every claim.'
cmux send-key --workspace "$WORKSPACE" --surface "$SURFACE" Return

# 5. Wait (don't poll) — wake via Hermes kanban or accept the 1-3 min latency
```

---

## Pairing with other skills

- **`cmux-dispatch-protocol`** — the operational layer below this skill. The 7
  reflexes live there; this skill enforces using them for recon specifically.
- **`dispatch-intent-gate`** — governs whether you should fire at all. Recon is
  cheap (dsv4 - pi is T1) so the gate is lightweight, but you still need explicit
  user `go` for high-cost follow-ups.
- **`bounded-subagent-dispatch-via-kanban`** — when you want durable task tracking
  + event-driven wake instead of fire-and-forget. Researcher - pi fan-out work can
  be kanban-tracked if it must survive across turns.

---

*This skill encodes a project law, not a preference. Violating it (researching
directly when dsv4 - pi is available) is a refactor-bait anti-pattern.*
