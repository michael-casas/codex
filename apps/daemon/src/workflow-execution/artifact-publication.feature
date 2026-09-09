Feature: Durable workflow artifact names
  Scenario: ARTIFACT-L3-NAMES A workflow preserves named evidence through delivery and restart
    When a fixture workflow publishes mixed-case evidence through durable delivery
    Then every original artifact name and digest remains visible after service restart
    And replay preserves one registration per name without model turns
