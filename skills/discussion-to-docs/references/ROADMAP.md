# ROADMAP — Capability Sequencing

## Phase 0: Foundation (must exist before any compilation)

```
[IC-1]  Natural language intent parser
[IC-5]  Intent IR schema validator
[DC-1]  Capability extractor
```

What this enables: raw intent can enter the pipeline and be validated.
Single-Fable-5-turn scope.

---

## Phase 1: Intent → Domains

```
[IC-2]  Constraint classifier
[IC-3]  Outcome quantifier
[IC-4]  Scope boundary detector
[DC-2]  Domain boundary inference
[DC-4]  Noise filter
```

What this enables: full PRD_IR → DOMAINS compilation. Two-layer pipeline live.

---

## Phase 2: Domains → Features

```
[DC-3]  Inter-domain dependency mapper
[DC-5]  Domain coherence validator
[FD-1]  Per-domain feature extractor
[FD-2]  Core/optional classifier
[FD-3]  Intra-domain dependency sorter
[FD-4]  Feature atomicity checker
```

What this enables: three-layer pipeline (PRD → DOMAINS → FEATURES).

---

## Phase 3: Features → Roadmap

```
[RS-1]  Dependency-chain phase grouper
[RS-2]  Risk-based phase sorter
[RS-3]  Value-based priority ranker
[RS-4]  Milestone boundary marker
```

What this enables: full four-layer pipeline end-to-end.

---

## Phase 4: Hardening

```
[IC-6]  Multi-turn intent refinement
[FD-5]  Cross-domain feature collision detector
[FD-6]  Feature cardinality estimator
[RS-5]  Critical-path detector
[RS-6]  What-if rephrasing engine
```

What this enables: production-grade reliability, collision detection,
refinement loops.

---

## Phase Ordering Rationale

| Decision | Reason |
|----------|--------|
| Phase 0 before anything | Pipeline must accept input before any stage runs |
| Phases 1→2→3 sequential | Each layer consumes the previous layer's IR |
| Phase 4 last | Optional features that improve quality, not correctness |
| Phase 0 single-turn | Foundation is small enough for one Fable-5 pass |
