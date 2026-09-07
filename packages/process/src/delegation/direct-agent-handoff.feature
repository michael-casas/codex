Feature: Direct local and remote agent handoff

  Scenario: The control thread delegates one local and one remote agent
    Given admitted local and authenticated remote App Server hosts
    When the control thread delegates one assignment to each host
    Then two stable agent handles are returned without duplicate turns
    And one agent can continue while the other bounded wait is cancelled
