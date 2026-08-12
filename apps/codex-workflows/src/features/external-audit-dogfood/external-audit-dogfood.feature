@CDX-WF-EXT-AUDIT-3
Feature: Independent external audit literal-shebang dogfood
  Rule: The public trusted TypeScript runner must produce inspectable Luna-only evidence

    Scenario: A3-L3-001 Execute two roots and one strict join through the installed interpreter
      Given the Attempt 3 literal-shebang workflow and installed interpreter are admitted
      When the auditor executes the Attempt 3 workflow through its literal shebang
      Then the run completes with exactly two Luna medium roots and one Luna medium join
      And actual distinct typed upstream values reach the strict-schema consolidator
      And the journal artifact digests and cleanup obligations are independently satisfied
