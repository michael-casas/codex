Feature: Local project admission through Codex Control
  An authorized local caller can select a project without changing daemon configuration for every repository.

  @PC-L3-ADMISSION
  Scenario: Admit an external project through the public control tools
    Given a local caller has a granted project admission policy and a canonical repository
    When the caller explicitly admits an external Git project through MCP
    Then the tool returns that project's host and repository identity
    And source compilation selects that external project without executing the canonical source
