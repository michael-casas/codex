@l3 @process @proof-recovery
Feature: Immutable workflow proof recovery
  Repository-scoped clients register exact proof while the deterministic reducer alone decides readiness.

  Scenario: Complete immutable proof becomes ready for independent judgment
    Given a new Founder recovery campaign and exact workflow candidate
    When the coordinator registers the candidate and Preflight registers the complete immutable evidence bundle
    And Preflight submits passing nonzero gates with zero unexpected resource delta
    Then the scoped reader observes the reducer-approved judgment-ready projection

  Scenario: Authored or unregistered proof cannot approve Preflight
    Given a new Founder recovery campaign and exact workflow candidate
    When a worker attempts to submit an unregistered authored report as valid Preflight proof
    Then the scoped operation is rejected and the candidate remains not ready for judgment
