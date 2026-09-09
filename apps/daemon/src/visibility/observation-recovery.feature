Feature: Truthful observation during source outages
  Scenario: Recover observation without replaying execution
    When an observer loses its fixture database listener before a workflow fails
    Then public reads report degradation and recover the unchanged terminal history

  Scenario: Safe observation error responses
    When fixture snapshot serialization and wait operations fail
    Then both public operations return well-formed safe error JSON

  Scenario: Preserve an interrupted execution binding
    When the provider reports the bound fixture turn was interrupted without output
    Then reconciliation reports a terminal interruption without starting another agent
