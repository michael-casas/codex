# DOMAINS — Capability Grouping

## 1. Intent Capture

**Owner:** Product
**Boundary:** Raw user intent → structured IR
**Dependencies:** None (input layer)

Capabilities:
- Intent extraction from natural language
- Constraint identification (business, platform, performance)
- Outcome definition
- Scope boundary detection

**Artifact produced:** PRD_IR.md

---

## 2. Domain Classification

**Owner:** Product + Engineering
**Boundary:** PRD IR → domain clusters
**Dependencies:** Domain 1 (PRD_IR.md must exist)

Capabilities:
- Capability identification from intent
- Domain boundary detection
- Dependency graph construction between domains
- Non-domain noise filtering

**Artifact produced:** DOMAINS.md

---

## 3. Feature Decomposition

**Owner:** Engineering
**Boundary:** Domains → atomic feature units
**Dependencies:** Domain 2 (DOMAINS.md must exist)

Capabilities:
- Feature extraction per domain
- Core vs optional classification
- Intra-domain dependency ordering
- Feature atomicity validation

**Artifact produced:** One canonical `packages/<domain>/src/FEATURES.md` per accepted domain, following `DISTRIBUTED_FEATURES.md`

---

## 4. RS (Roadmap Sequencing)

**Owner:** Product
**Boundary:** Features → ordered capability timeline
**Dependencies:** Domain 3 (every accepted domain's canonical `FEATURES.md` must exist)

Capabilities:
- Phase grouping by dependency chain
- Risk-based ordering (high-risk first/early validation)
- Value-based prioritization (fastest value first)
- Milestone boundary definition

**Artifact produced:** ROADMAP.md

---

## Cross-Cutting

**Not domains, shared across all layers:**

| Concern | Applied in |
|---------|-----------|
| Determinism enforcement | All layers (schema constraints per layer) |
| IR purity (no downstream leak) | All layers (output contract per layer) |
| Fable-5 budget optimization | Dispatch layer (per-stage token allocation) |
