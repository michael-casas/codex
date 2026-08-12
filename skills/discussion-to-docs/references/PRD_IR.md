# PRD_IR — Intent Intermediate Representation

## What

A multi-stage compiler pipeline that transforms raw product intent into
executable software structure through deterministic decomposition layers.

## Who

- **Primary:** Product/engineering teams defining new capabilities
- **Secondary:** Fable-5 (GPT-5.4) as the compilation engine across all stages

## Why

Traditional single-document prompts bundle intent, structure, timeline,
experience, and execution into one artifact — causing non-deterministic
output, hallucinated planning, and mixed abstraction levels.

## What problem it solves

1. Single-document PRD prompts produce non-deterministic decomposition
   (every run interprets differently)
2. No compiler boundaries → no separation of intent vs design vs execution
3. Mixed abstraction levels force the model to invent structure instead of
   deriving it

## Success

- Deterministic output across independent compilation stages
- Each layer produces one artifact type with zero overlap
- Human reviews per layer, not per monolithic document
- Fable-5 token budget optimized per stage (not one mega-prompt)

## Constraints (high-level)

- No design or execution detail in PRD layer
- No access-control or data-protection concerns across layers
- Output is IR, not end-user documentation
- Each layer is independently executable by Fable-5

## Non-goals

- This is NOT a PRD generator
- This is NOT a project management tool
- This is NOT an infrastructure design system
- This does NOT replace human product judgment

## Outcomes (must be true when "done")

- Intent flows deterministically through PRD → DOMAINS → FEATURES → RS
- Each layer is independently verifiable
- Downstream layers consume only the IR from the layer above
- Fable-5 can execute any single layer in isolation
