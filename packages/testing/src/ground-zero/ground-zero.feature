@GROUND-0
Feature: Nx-native testing feedback
  Rule: A developer receives one ordered and evidenced test workflow

    Scenario: G0-AGGREGATE-001 Run the complete project test contract
      Given a project has one independently passing suite in every applicable Ground-0 layer
      When the developer runs the public Ground-0 aggregate
      Then the suites are reported from Layer 1 through Layer 3 in fidelity order
      And the aggregate writes valid machine-readable evidence with nonzero selections
      And no temporary execution state remains
