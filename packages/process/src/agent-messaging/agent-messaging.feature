@l3 @process @agent-messaging
Feature: Durable local and remote agent intercom
  Agent messages remain durable and correlated while App Server delivery is deduplicated.

  Scenario: CAS05-L3-INTERCOM local agent asks remote agent and receives one correlated reply
    Given two registered agents on local and controlled authenticated remote App Server hosts
    When the local agent asks the remote agent and the remote agent replies
    Then the local agent observes one correlated reply and duplicate delivery creates one visible message
