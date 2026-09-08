@web
Feature: Observe a running Codex workflow
  @BATDD-CAS-10-001
  Scenario: Follow research while implementation waits
    Given the estimating workflow has two of three research agents complete
    When the operator opens the workflow visibility route
    Then research progress and the waiting implementation step are visible
    When the operator selects Ada
    Then only Ada's current feed is visible
    When the operator collapses the selected feed
    Then no agent detail feed remains visible
