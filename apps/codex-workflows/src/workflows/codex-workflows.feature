@CDX-WF-GC-1
Feature: Deterministic Codex workflow preparation
  Rule: Local preparation remains deterministic and non-authoritative

    Scenario: CLI-L3-001 Validate, inspect, plan, and dry-run the canonical workflow
      Given the canonical workflow source and input have been hashed
      When the user validates, inspects, plans, and dry-runs them through codex-workflows
      Then every local command succeeds with one definition digest
      And the dry-run reports zero side effects
      And the workflow source and input bytes remain unchanged

    Scenario: CLI-L3-002 Refuse durable execution without the accepted control plane
      Given a repository sentinel records the current local state
      When the user asks codex-workflows to run the canonical workflow
      Then the command fails with CONTROL_PLANE_UNAVAILABLE and exit 69
      And no repository sentinel or legacy state changes

    Scenario: CLI-L3-003 Import an observed pi goal as historical data
      Given an observed pi version 3 goal has been hashed
      When the user imports the pi goal through codex-workflows
      Then the mapping retains the legacy goal identity as historical claims
      And the pi goal bytes remain unchanged

  @CDX-WF-GC-2
  Rule: Trusted local TypeScript executes directly without claiming durable authority

    Scenario: CLI-L3-004 Execute an exact-shebang TypeScript workflow through the public interpreter
      Given a controlled trusted TypeScript workflow and input
      When the user executes the workflow through its codex-workflows shebang
      Then the two research agents overlap and the consolidator receives both actual outputs
      And the requested valid gpt models and medium reasoning reach the SDK boundary
      And the final proposal artifact and completed local journal exist
      And public workflow state contains digests but no prompt input environment or raw error values

    Scenario: CLI-L3-005 Inspect a trusted TypeScript workflow without launching an agent
      Given a controlled trusted TypeScript workflow and input
      When the user plans and dry-runs the TypeScript workflow
      Then both inspections succeed and report zero launched agents
      And the controlled SDK trace remains empty
