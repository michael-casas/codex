import { describe, expect, it } from 'vitest';
import {
  createAppServerWorkflowExecutor,
  type AppServerWorkflowConnection,
} from '../app-server-workflow.executor.js';

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] workspace temp policy', () => {
  it.each([
    '/lease/workspace/.codex-workspace-tmp',
    '/lease/workspace/.codex-workspace-tmp-aB1234',
  ])(
    'TEMP-L1-PROTOCOL binds private temp %s and a no-network turn sandbox',
    async (tempDirectory) => {
      const calls: Array<{ method: string; params: unknown }> = [];
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        release = resolve;
      });
      const connection: AppServerWorkflowConnection = {
        async request(method, params) {
          calls.push({ method, params });
          if (method === 'thread/start')
            return { thread: { id: 'thread-a' } } as never;
          if (method === 'turn/start') {
            setTimeout(release, 0);
            return { turn: { id: 'turn-a' } } as never;
          }
          return {} as never;
        },
        async *messages() {
          await started;
          yield {
            kind: 'notification',
            method: 'item/completed',
            params: {
              threadId: 'thread-a',
              turnId: 'turn-a',
              item: {
                id: 'answer',
                type: 'agentMessage',
                phase: 'final_answer',
                text: 'done',
              },
            },
          } as never;
          yield {
            kind: 'notification',
            method: 'turn/completed',
            params: {
              threadId: 'thread-a',
              turn: { id: 'turn-a', status: 'completed' },
            },
          } as never;
        },
        async respond() {
          return undefined;
        },
        async reconnect() {
          throw Error('UNEXPECTED_RECONNECT');
        },
      };
      const options = {
        connection,
        cwd: '/lease/workspace',
        tempDirectory,
        sandbox: 'workspaceWrite' as const,
        approvalPolicy: 'never' as const,
      };
      const executor = createAppServerWorkflowExecutor(options);
      try {
        await executor.executeAgent({
          node: { id: 'node', model: 'gpt-5.6-luna', reasoning: 'low' },
          model: 'gpt-5.6-luna',
          reasoning: 'low',
          prompt: 'controlled',
          signal: new AbortController().signal,
          onRuntimeEvent: () => undefined,
        });
      } finally {
        await executor.close();
      }
      expect(
        calls.find((call) => call.method === 'thread/start')?.params,
      ).toMatchObject({
        cwd: options.cwd,
        sandbox: 'workspace-write',
        config: {
          shell_environment_policy: {
            set: {
              TMPDIR: options.tempDirectory,
              TMP: options.tempDirectory,
              TEMP: options.tempDirectory,
            },
          },
        },
      });
      expect(
        calls.find((call) => call.method === 'turn/start')?.params,
      ).toMatchObject({
        sandboxPolicy: {
          type: 'workspaceWrite',
          writableRoots: [options.cwd, options.tempDirectory],
          networkAccess: false,
          excludeTmpdirEnvVar: true,
          excludeSlashTmp: true,
        },
      });
    },
  );
});
