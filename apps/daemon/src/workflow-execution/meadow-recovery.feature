Feature: Owned coordinator messaging and workflow lease recovery
  Scenario: MEADOW-L3-MESSAGE A coordinator messages its admitted agent durably
    When an authenticated coordinator delegates and messages its owned fixture agent
    Then the message is delivered once and foreign recipients remain forbidden
  Scenario: MEADOW-L3-LEASE Intentional runs preserve independent workspace custody
    When two fixture runs acquire workspaces and the lease service restarts
    Then each run owns its workspace and foreign lease evidence remains intact
