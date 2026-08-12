@CDX-WF-DAILY-FACTS @L3
Feature: Founder daily-facts self-dogfood
  Rule: The standardized public workflow must publish three current-news briefs

    Scenario: DAILY-FACTS-L3-001 Publish three current-news industry briefs through the public workflow runner
      Given the installed public workflow interpreter and isolated proof root are ready
      When the workflow researches current UTC daily news through its literal shebang
      Then the Founder daily-facts topology content report journal and resource contract is satisfied
