@WIKI-PORTABLE
Feature: Portable Agent Wiki retrieval
  Rule: A coding agent can use a cloned Wiki without host-specific paths

    Scenario: WIKI-PORTABLE-001 Resolve a cloned vault through AGENT_WIKI_HOME
      Given a cloned Agent Wiki vault containing a portable note
      And AGENT_WIKI_HOME points to that vault
      When the agent reindexes and retrieves the note through the public wiki CLI
      Then the portable note is returned successfully
      And the Wiki note remains unchanged
      And the generated index is outside the cloned vault
