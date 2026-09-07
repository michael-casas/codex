Feature: Task-level MCP control
  Scenario: CAS09-L3-ONE-CALL A control thread uses one bounded snapshot call
    Given a codex-control MCP connection
    When the control thread requests one control snapshot
    Then one compact cursor result is returned
