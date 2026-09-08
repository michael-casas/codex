@web @cas-ui-r2
Feature: Readable current workflow activity
  Operators follow real workflow activity without raw event fragments or false execution state.

  @BATDD-R2-TITLE
  Scenario: Read a human workflow title without horizontal overflow
    Given a source workflow with a long human title runs a writer and companion
    When the operator opens its workflow view
    Then the human title appears in the heading and browser tab without overflowing
    And no source signature is presented as the heading

  @BATDD-R2-FEED
  Scenario: Follow one safe message through completion and a validated result
    Given a source workflow with a long human title runs a writer and companion
    When the operator opens the writer feed
    Then many writer deltas form one stable message
    When the writer corrects and completes that message with Markdown and hostile content
    Then its existing message is replaced with safe strong and code formatting
    And one compact completed tool is visible without raw parameters
    When the writer returns a schema-validated ready result
    Then labeled result fields appear without raw JSON while the companion keeps the workflow running

  @BATDD-R2-SCROLL
  Scenario: Read older activity in a bounded feed with reduced motion
    Given a source workflow with a long human title runs a writer and companion
    And the operator prefers reduced motion
    When the operator opens a long writer feed and scrolls to older activity
    Then the feed is internally scrollable with its header and close control visible
    When new writer activity arrives
    Then the reader position is preserved and jump to latest is available
    When the operator jumps to the latest activity
    Then the newest activity is visible without text reveal animation

  @BATDD-R2-CANCEL
  Scenario: Remove cancelled current work only after authoritative cancellation
    Given a source workflow with a long human title runs a writer and companion
    When the operator opens the writer feed
    And provider status becomes unknown
    Then the workflow and companion remain in the current view
    When the workflow is authoritatively cancelled
    Then its cards and selected feed disappear and the direct route is reconciled
    And the known-empty view says No Workflows Running
