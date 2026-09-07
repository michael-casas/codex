@codex @BATDD-CAS-11-R2
Feature: Install Codex Control from the repository marketplace
  @BATDD-CAS-11-R2-001
  Scenario: A fresh Codex installation discovers the control skill and MCP tools
    Given the repository marketplace contains the canonical Codex Control plugin
    When a fresh isolated Codex home installs Codex Control
    Then the installed plugin exposes the Codex Control skill and MCP server
    And one delegated agent result contains the loopback Browser URL
    And no ChatGPT application or tunnel is required
