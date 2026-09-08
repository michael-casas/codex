Feature: Task-level MCP control
  Scenario: CAS09-L3-ONE-CALL A control thread uses one bounded snapshot call
    Given a codex-control MCP connection
    When the control thread requests one control snapshot
    Then one compact cursor result is returned

  Scenario: CAS-EXISTING-THREAD-HANDOFF-R1-L3 Adopt and continue one existing thread
    Given a codex-control MCP connection with an adoptable existing thread
    When the control thread adopts and continues that thread
    Then both prompts target the same thread and one stable viewer route is returned
