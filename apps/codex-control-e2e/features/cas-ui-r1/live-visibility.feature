@web
Feature: Observe production workflow execution live
  @BATDD-UIR1-LIVE
  Scenario: Follow a running workflow through live updates, selection and recovery
    Given a production runtime executes two synthetic App Server agents
    When the operator opens the workflow view
    Then the Research phase displays both running agents
    When the operator selects Agent A
    Then only Agent A live feed is visible
    When Agent A finishes
    Then Agent B remains visible and progress advances
    When the remaining workflow finishes and the runtime restarts
    Then the completed workflow remains visible without duplicate agents

  @BATDD-UIR1-OFFLINE
  Scenario: Distinguish runtime outage from an empty workflow list
    Given a production runtime executes two synthetic App Server agents
    When the operator opens the workflow view
    Then the Research phase displays both running agents
    When the browser loses runtime connectivity
    Then the last-known workflow remains visibly stale and offline

  @BATDD-UIR1-HANDOFF
  Scenario: Inspect a direct handoff live and after restart
    Given a production runtime launches a synthetic direct handoff
    When the operator opens the direct agent view
    Then the direct agent and its live feed are visible
    When the direct agent finishes and the runtime restarts
    Then the completed direct agent and captured feed remain visible
