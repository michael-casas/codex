Feature: Remote workflow execution
  Scenario: A remote research phase feeds a dependent implementation artifact
    Given an admitted controlled remote App Server workflow host
    When one trusted workflow is submitted through run_workflow
    Then every research node completes before implementation starts
    And the final artifact and result are observable from one stable run handle
