import {
  createDurableWorkflowClient,
  type AgentAuthorization,
  type AgentMessageHandle,
  type DurableWorkflowControlStore,
} from '@codex/process';
import { prepareWorkflowRun } from '@codex/workflows';

import type {
  CodexControlPlane,
  ControlAuthorization,
} from './codex-control.gateway.js';

export interface CodexControlServices {
  readonly delegation: {
    delegateAgent(command: unknown): Promise<unknown>;
    cancelAgent(delegationId: string): Promise<unknown>;
  };
  readonly messaging: {
    send(
      command: never,
      authorization: AgentAuthorization,
    ): Promise<AgentMessageHandle>;
    ask(
      command: never,
      authorization: AgentAuthorization,
    ): Promise<AgentMessageHandle>;
    reply(
      command: never,
      authorization: AgentAuthorization,
    ): Promise<AgentMessageHandle>;
  };
  readonly visibility: {
    snapshot(query: {
      selectedAgentId?: string;
      selectionId?: string;
    }): Promise<unknown>;
    wait(
      query: {
        afterCursor: string;
        waitMs: number;
        selectedAgentId?: string;
        selectionId?: string;
      },
      signal?: AbortSignal,
    ): Promise<unknown>;
  };
  readonly workflowStore: DurableWorkflowControlStore;
}

export function createCodexControlPlane(
  services: CodexControlServices,
): CodexControlPlane {
  const workflows = createDurableWorkflowClient({
    store: services.workflowStore,
    prepare: prepareWorkflowRun,
  });
  const agentAuthorization = (
    authorization: ControlAuthorization,
  ): AgentAuthorization => authorization;

  const control: CodexControlPlane = {
    delegateAgent: (command) => services.delegation.delegateAgent(command),
    sendAgentMessage: (kind, command, authorization) =>
      services.messaging[kind](
        command as never,
        agentAuthorization(authorization),
      ),
    runWorkflow: (command) => workflows.runWorkflow(command),
    cancelAgent: (delegationId) =>
      services.delegation.cancelAgent(delegationId),
    cancelWorkflow: (runId) => workflows.cancelWorkflow(runId),
    snapshot: (query) => services.visibility.snapshot(query),
    wait: (query, _authorization, signal) =>
      services.visibility.wait(query, signal),
  };
  return Object.freeze(control);
}
