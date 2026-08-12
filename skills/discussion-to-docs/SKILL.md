---
name: discussion-to-docs
description: >-
  Guided conversation-to-document pipeline. Turns open-ended discussion into
  structured documentation such as PRDs, ADRs, specs, domain maps, feature
  inventories, and roadmaps. On Codex, begin with one complete, numbered,
  document-specific questionnaire in ordinary assistant text; do not use
  request_user_input, a clarify tool, or iterative one-question-at-a-time
  prompting. Other runtimes may use their native inline questioning mechanism.
metadata:
  version: 1.2.0
  hermes:
    tags: [discussion, docs, prd, roadmap, questionnaire, inline-questions, clarifying-questions, same-turn]
    category: engineering
    priority: high
---

# Discussion → Docs

## Codex Contract — Full Questionnaire First

When running on Codex, make the first substantive response a **complete upfront
questionnaire for the requested document**.

1. Identify the target document type and read its applicable schema contract.
2. Derive the full set of decisions needed to produce a complete document. Let
   that set determine **N**; do not impose an arbitrary question count.
3. Present all questions together as `1` through `N` in ordinary assistant text.
   Give concise answer choices where they reduce ambiguity, and always allow a
   free-form answer.
4. End the response and wait for the user to answer the questionnaire in one
   message.
5. Use those answers to write the document. Ask a second batch only when the
   answers expose a new, genuinely blocking contradiction that could not have
   been anticipated from the document schema.

This contract is mandatory on Codex even when `request_user_input`, a `clarify`
tool, plan-mode input controls, or similar structured-question mechanisms are
available. **Do not call them. Do not ask one question at a time. Do not start
drafting the document before the upfront questionnaire is answered.**

## The Problem (why this skill exists)

Existing "grilling" skills (`grill-me`, `grill-with-docs` - see `.agent/seeding`) ask one question at a time,
ending their turn after each one. On Hermes, `clarify` is a tool call that terminates
the agent's turn — every question burns a round-trip.

**Cost of the turn-per-question pattern (Fable 5 context, Jul 2026):**
- 5 clarifying questions × 2 turns each (ask + answer) = 10 turns
- Each turn resets context — all prior answers are re-read from the transcript
- On Fable 5 with a 50% weekly cap, every extra turn is precious

**The fix:** use the runtime's **inline questioning mechanism** —
the model presents numbered options (1-4) in its response, the TUI/runtime
captures user input in the same turn, and the model continues without
ending its turn. The key insight: the "trigger" varies by runtime.

## Target Runtimes — Inline Questioning Mechanism

Three runtimes have different mechanisms:

### 1. Claude Code — Text-Based Inline Questions

**Mechanism:** The model naturally outputs numbered choices as **plain text**
(e.g. "1. Start working? 2. Review the directive? 3. Something else?").
The Claude Code TUI detects the question pattern and pauses for user input
in the same turn — the model does NOT end its turn.

**Documented in:** `cmux-delegation` SKILL.md §"Claude Code clarifying questions":
*"the model may respond with clarifying questions instead of executing
the instructions. It presents options like '1. Start working? 2. Review the
directive? 3. Something else?' and waits for user input."*

**Trigger:** No special tool needed. The model does this naturally when
the prompt is ambiguous or under-specified. The skill just needs to
instruct: "ask clarifying questions inline as needed."

**To DISABLE (for execution-only charters):**
```
CRITICAL: Implement ALL of the following tasks in order. Do NOT ask questions.
Do NOT present options. Do NOT ask 'what's next'. Just execute each step.
```

### 2. Codex CLI — Turn-Based (No Same-Turn Mechanism)

**Mechanism:** Codex CLI does NOT have an inline same-turn questioning
mechanism. The model outputs clarifying text, the turn ends, the user
responds in the next turn (standard conversation flow).

**For discussion-to-docs on Codex:** follow the Codex Contract above. Produce
the full document-specific `1..N` questionnaire as ordinary assistant text in
the first substantive response. Do not call `request_user_input`, `clarify`, or
an equivalent tool even if one is available. User replies with all answers in
one response; then write the document.

### 3. Pi (GPT-5.4 / cmux TUI) — Hermes' clarify Tool

**Mechanism:** Pi surfaces use the same `clarify` tool as Hermes — a
**first-class structured mechanism** that blocks the agent thread on a
`threading.Event` while the user responds. The agent continues in the
**same turn** after the user answers.

**How it works:**
1. Agent calls `clarify(question="...", choices=["A","B","C","D"])`
2. The tool blocks the agent thread
3. The React Ink `ClarifyPrompt` renders choices on the Pi cmux TUI
4. User picks via arrow keys + Enter (or number keys 1-4)
5. "Other (type your answer)" is auto-appended as option 5
6. User responds → `threading.Event` resolves → agent continues

**Schema rule:** put each option ONLY in the `choices` array — never
enumerate options inside the `question` text. The UI renders `choices`
as selectable rows; options in the question string render as dead prose.

**This is the most efficient mechanism for Fable 5 sessions** because
it doesn't burn a round-trip per question.

### Runtime Comparison

```
┌──────────────┬────────────────────────┬─────────────────────┐
│ Runtime      │ Inline Q mechanism?    │ Question format     │
├──────────────┼────────────────────────┼─────────────────────┤
│ Claude Code  │ Text-based (naturally  │ Numbered (1-4) text │
│              │ outputs choices, TUI   │ in response         │
│              │ pauses for input)      │                     │
├──────────────┼────────────────────────┼─────────────────────┤
│ Codex CLI    │ ⨯ No same-turn         │ End-turn text block │
│              │ mechanism              │ (all questions at   │
│              │                        │ once, reply next    │
│              │                        │ turn)               │
├──────────────┼────────────────────────┼─────────────────────┤
│ Pi (GPT-5.4) │ ✓ clarify tool         │ Structured choices  │
│              │ (blocks agent thread,  │ (4 + "Other") via   │
│              │ same-turn continue)    │ arrow keys / nums   │
├──────────────┼────────────────────────┼─────────────────────┤
│ Hermes CLI   │ ✓ clarify tool         │ Structured choices  │
│              │ (same as Pi)           │ (4 + "Other") via   │
│              │                        │ arrow keys / nums   │
└──────────────┴────────────────────────┴─────────────────────┘
```

For **Codex**, always use the mandatory full upfront `1..N` questionnaire. For
Hermes subagents running outside CLI/TUI, fall back to an end-turn bulk block.

## The Questionnaire Pattern

When the model needs to ask clarifying questions, use this structure:

### Same-turn inline format (Claude Code / Pi via clarify tool)

```
I need a few details before I can write this doc:

1. **Scope** — Is this for a single product or a platform?
   → A) Single product  B) Platform  C) Suite of products  D) Something else...

2. **Audience** — Who's the primary reader?
   → A) Executive  B) Engineering team  C) Customers  D) Something else...

3. **Depth** — How detailed should the output be?
   → A) High-level vision  B) Detailed spec  C) Both stages  D) Something else...

Reply with the number(s) of your choice(s), or type your answer for D.
```

### Full upfront questionnaire format (Codex)

```
Before I write the <document type>, please answer this complete questionnaire:

1. **Scope**
   A) Single product  B) Platform  C) Suite of products  D) [your answer]

2. **Audience**
   A) Executive  B) Engineering team  C) Customers  D) [your answer]

3. **Depth**
   A) High-level vision  B) Detailed spec  C) Both stages  D) [your answer]

...

N. **Final document-specific decision**
   A) Option one  B) Option two  C) Option three  D) [your answer]

Reply with all answers in one message (for example, "1B, 2C, 3A, ...") or
answer freely under each number.
```

Do not treat the three example questions above as a fixed questionnaire. Build
`1..N` from the required fields and decision points of the actual document
contract.

## Conversation-to-Doc Pipeline

The full flow from raw discussion → structured docs:

```
Phase 1: INTAKE
  ↓ Read the user's input / discussion / notes
  ↓ Detect the target artifact type (PRD / ADR / CONTEXT.md / Roadmap)
  ↓ Codex → present the full upfront 1..N questionnaire and end the turn
  ↓ Other runtimes → use their routed questioning mechanism
  ↓ Capture the complete answer set before drafting

Phase 2: SHAPE
  ↓ Organize decisions and open questions into sections
  ↓ Identify gaps that need resolution
  ↓ On Codex, ask another batch only for a newly exposed blocking contradiction

Phase 3: WRITE
  ↓ Author the document in the target format
  ↓ Use canonical templates:
    - PRD: Problem Statement / Solution / User Stories / Technical Decisions / Out of Scope
    - ADR: Status / Context / Decision / Consequences / Alternatives
    - CONTEXT.md: Glossary terms with canonical definitions
    - Roadmap: Phases / Timelines / Dependencies / Risks
  ↓ Write to the agreed path

Phase 4: REVIEW
  ↓ Present the document for user review
  ↓ If changes are requested, collect any related questions in one batch
  ↓ Capture answers, iterate
```

## Document Templates

### PRD Pattern

```markdown
## Problem Statement
[The problem from the user's perspective]

## Solution
[The proposed solution]

## User Stories
- As a <user>, I want <feat> so that <benefit>

## Technical Decisions
[Key decisions with rationale]

## Testing Decisions
[What makes a good test]

## Out of Scope
[Explicit non-goals]
```

### ADR Pattern

```markdown
# ADR-NNNN: <Title>

**Status:** Proposed | Accepted | Deprecated | Superseded

**Context:**
[Why this decision was needed]

**Decision:**
[What was decided]

**Consequences:**
[What changes as a result]

**Alternatives considered:**
[What was rejected and why]
```

### CONTEXT.md Pattern

```markdown
# <Project> — Domain Glossary

## <Term>
**Canonical definition:** One sentence.
**Aliases to avoid:** [terms that mean the same thing but shouldn't be used]
**Relationships:** [connections to other glossary terms]
```

### Roadmap Pattern (Casona-AI style)

```markdown
# <Project> — Roadmap

## Phase 1: <Name> (target: <date>)
**Goal:** [one-line outcome]
**Dependencies:** [blocking items]
**Key deliverables:**
- [list]

## Phase 2: ...

## Risks
[identified risks and mitigations]
```

## Constraints

1. **Let the model decide question length** — no byte caps on questions
   (Founder rule 2026-06-22). Byte caps cause compaction cycles.

2. **Output format = markdown** — all artifacts are markdown files

3. **Write to the project's docs path** — prefer `.agent/docs/` or
   project-root `docs/` as configured

4. **Only write when there's a verdict** — don't produce half-empty docs.
   Every section should have at least a sentence.

5. **Open questions go INLINE** in the doc, not in a separate section.
   Format: `**OPEN:** <question>` so they're searchable.

6. **Resolved questions get a verdict** with the date and source.

7. **For Fable 5 / Claude high-cost sessions** — minimize round-trips by
   asking ALL clarifying questions in the first inline block, not
   iteratively.

8. **For Codex sessions** — always ask the complete document-specific `1..N`
   questionnaire up front in ordinary assistant text. Never use
   `request_user_input`, `clarify`, or an equivalent structured-input tool.

## Default Output Paths

| Artifact type | Default path |
|---------------|-------------|
| PRD           | `docs/prd/<project>-prd.md` |
| ADR           | `docs/adr/<number>-<slug>.md` |
| CONTEXT.md    | `CONTEXT.md` (project root) |
| Domains       | `DOMAINS.md` (project root) |
| Features      | `packages/<domain>/src/FEATURES.md` per domain; optional root `FEATURES.md` index |
| Roadmap       | `docs/roadmap/<project>-roadmap.md` |
| Discussion    | `DISCUSSION.md` (project root) |

## References

- `grill-with-docs` — the turn-per-question predecessor skill
- `ambiguous-scope-decision-gating` — Hermes-specific end-turn clarification pattern (Discord rendering fix)
- `cmux-delegation` §"Claude Code clarifying questions" — the Claude Code inline question mechanism
- `discussion-doc` — the discussion doc artifact template (predecessor to this pipeline)
- `atdd` §"Clarifying Questions Before Fire" — when to ask clarifying questions vs not
- `references/runtime-questioning-mechanisms.md` — verified research on all three runtimes' questioning tools
- `references/DISTRIBUTED_FEATURES.md` — canonical per-domain feature IR and optional root-index contract

---

# Resource Pipeline — 4-Layer Compiler IR

The four IR contracts in `references/` define the intermediate representations
the agent produces during a discussion-to-docs session. They form a strict
dependency chain — each layer consumes the previous layer's output and produces
the next. Layer 3 produces one canonical file per domain rather than one
monolithic feature document.

```
┌─────────────────────────────────────────────────────┐
│                   1. PRD_IR.md                       │
│               Intent Intermediate Representation     │
│               what + why + success + constraints     │
│               NO: planning, architecture, features   │
└──────────────────────┬──────────────────────────────┘
                       │ input to
                       ▼
┌─────────────────────────────────────────────────────┐
│                   2. DOMAINS.md                       │
│               Capability Clustering                   │
│               domain boundaries + ownership + deps    │
│               NO: features, roadmap, implementation  │
└──────────────────────┬──────────────────────────────┘
                       │ input to
                       ▼
┌─────────────────────────────────────────────────────┐
│              3. DISTRIBUTED_FEATURES.md               │
│               Atomic Feature Decomposition            │
│    packages/<domain>/src/FEATURES.md per domain       │
│      optional root FEATURES.md is links/index only    │
│               NO: timelines, phases, implementation  │
└──────────────────────┬──────────────────────────────┘
                       │ input to
                       ▼
┌─────────────────────────────────────────────────────┐
│                  4. ROADMAP.md                        │
│               Capability Sequencing                   │
│               phase ordering + dependency chain       │
│               NO: design detail, code, architecture  │
└─────────────────────────────────────────────────────┘
```

## How the Agent Uses These Resources

### Session Start

1. **Read all 4 IR contract files** at session start to understand the output
   contract — `PRD_IR.md`, `DOMAINS.md`, `DISTRIBUTED_FEATURES.md`, and
   `ROADMAP.md`.
2. **Check which layer the user's input belongs to:**
   - Raw intent → you're at Layer 1 (PRD)
   - Grouped domains → skip to Layer 2 (DOMAINS)
   - Feature requests → skip to Layer 3 (FEATURES)
   - Sequencing discussion → skip to Layer 4 (ROADMAP)
3. **Do NOT regurgitate the references.** They are the agent's internal schema
   contract, not user-facing output.

### During the Discussion

When the user provides raw input (notes, chat history, voice transcript):

```
1. PARSE  → classify the input into one of the 4 layers
2. FILL   → if enough info exists, write the IR for that layer
3. QUESTION → on Codex, ask the full upfront `1..N` questionnaire in plain text;
              on other runtimes, use the routed mechanism
4. CONFIRM → present the artifact to the user for review
5. NEXT   → offer to proceed to the next layer
```

### Layer-by-Layer Agent Behavior

| Layer | Agent reads | Agent asks | Agent writes |
|-------|------------|------------|-------------|
| PRD | `PRD_IR.md` for schema | What, why, for whom, success | Filled `PRD_IR.md` |
| DOMAINS | `DOMAINS.md` for schema | How capabilities group, boundaries | Filled `DOMAINS.md` |
| FEATURES | `DISTRIBUTED_FEATURES.md` for schema | Atomic units per domain, deps | One `packages/<domain>/src/FEATURES.md` per accepted domain; optional root index |
| ROADMAP | `ROADMAP.md` plus every canonical per-domain `FEATURES.md` | Phase ordering, risk, value | Filled `ROADMAP.md` |

### Session End

The PRD, root `DOMAINS.md`, distributed per-domain `FEATURES.md` files, and
`ROADMAP.md` become the durable record. Downstream consumers (BATDD generators,
AST compilers, execution agents) read them in sequence.

### Constraint: IR Purity

- **Layer N reads Layer N-1, writes Layer N**
- **Layer N never reads Layer N+1** — no forward references
- **Layer N never writes to Layer N-1** — no back-propagation of structure
- **Explicit human rulings may amend an earlier layer** — downstream agents may
  not infer or perform that amendment themselves
- **Layer 3 authority is distributed** — every feature has exactly one owning
  `packages/<domain>/src/FEATURES.md`; a root index MUST NOT duplicate or
  override feature definitions
- **Domain package paths preserve affected selection** — do not place accepted
  domains beneath `packages/domains/`

---

# Expandability

## Skill Evolution

This skill is not static. When the agent identifies a gap, friction, or
opportunity during a discussion-to-docs session, the skill should be
improved.

**Allowed evolution triggers:**
- A document type is needed but has no IR schema (e.g., the agent discovers
  the team needs a `DESIGN.md` standard but none exists in `references/`)
- The questioning pattern produces ambiguous or low-quality answers
- The pipeline ordering doesn't match how the team actually works
- A new artifact type becomes a recurring pattern across sessions

## Agent's Duty to Propose Standards

When the agent spots an opportunity for a new document standard — during or
at the end of a session — the agent MUST:

1. **Name the standard** (e.g., `DESIGN.md`, `SPEC.md`, `QA.md`)
2. **Propose it to the user** — what it would contain, why it's worth having
3. **Offer to implement it** — draft the IR schema as a new file in
   `references/` following the same format as the existing 4 IR files
   (what + why + schema + constraints + non-goals)
4. **Update the skill version** — increment the minor version in SKILL.md's
   YAML frontmatter
5. **Update this section** — add the new standard to the pipeline diagram
   and update the References list
6. **Commit to source code** — write both the new reference file and the
   updated SKILL.md to the project's `.agents/skills/` directory

## When NOT to Propose

- During the user's first session with the skill (establish trust first)
- When the user is time-constrained (flag it as "future opportunity")
- When the proposal would overlap with an existing standard
- When the standard is a one-off document pattern, not a recurring need
