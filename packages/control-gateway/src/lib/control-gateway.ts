import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';

export interface ControlAuthorization {
  readonly actorAgentId: string;
  readonly scopes: readonly string[];
}

export interface CodexControlPlane {
  delegateAgent(
    command: unknown,
    authorization: ControlAuthorization,
  ): Promise<unknown>;
  continueAgent?(
    command: unknown,
    authorization: ControlAuthorization,
  ): Promise<unknown>;
  sendAgentMessage(
    kind: 'send' | 'ask' | 'reply',
    command: unknown,
    authorization: ControlAuthorization,
  ): Promise<unknown>;
  runWorkflow(
    command: unknown,
    authorization: ControlAuthorization,
  ): Promise<unknown>;
  cancelAgent(
    delegationId: string,
    authorization: ControlAuthorization,
  ): Promise<unknown>;
  cancelWorkflow(
    runId: string,
    authorization: ControlAuthorization,
  ): Promise<unknown>;
  snapshot(
    query: { selectedAgentId?: string; selectionId?: string },
    authorization: ControlAuthorization,
  ): Promise<unknown>;
  wait(
    query: {
      afterCursor: string;
      waitMs: number;
      selectedAgentId?: string;
      selectionId?: string;
    },
    authorization: ControlAuthorization,
    signal: AbortSignal,
  ): Promise<unknown>;
}

type HandlerExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export interface CodexControlServerOptions {
  readonly control: CodexControlPlane;
  readonly authorize: (
    tool: string,
    extra: HandlerExtra,
  ) => Promise<ControlAuthorization> | ControlAuthorization;
  readonly browserBaseUrl?: string;
}

export const codexControlToolCatalog = Object.freeze([
  { name: 'delegate_agent', readOnly: false, destructive: false },
  { name: 'continue_agent', readOnly: false, destructive: false },
  { name: 'send_agent_message', readOnly: false, destructive: false },
  { name: 'ask_agent', readOnly: false, destructive: false },
  { name: 'reply_agent', readOnly: false, destructive: false },
  { name: 'run_workflow', readOnly: false, destructive: false },
  { name: 'cancel_agent', readOnly: false, destructive: true },
  { name: 'cancel_workflow', readOnly: false, destructive: true },
  { name: 'get_control_snapshot', readOnly: true, destructive: false },
  { name: 'wait_control_delta', readOnly: true, destructive: false },
] as const);

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);
const cursor = z.string().regex(/^(0|[1-9]\d*)$/);
const messageInput = {
  idempotencyKey: id,
  fromAgentId: id,
  toAgentId: id,
  body: z.string().min(1).max(32_768),
  correlationId: id.optional(),
  expiresAt: z.iso.datetime().optional(),
};
const workflowInput = {
  workflowRef: id,
  sourceDigest: digest,
  input: z.unknown(),
  hostId: id,
  repositoryId: id,
  baseRevision: revision,
  assignmentId: id,
  model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,253}$/),
  reasoningEffort: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  sandbox: z.enum(['readOnly', 'workspaceWrite']),
  idempotencyKey: id,
};
const sourceWorkflowInput = z.strictObject({
  source: z.string().min(1).max(4096),
  input: z.unknown().optional(),
  hostId: id.optional(),
  idempotencyKey: id,
});
const registeredWorkflowInput = z.strictObject(workflowInput);
// MCP discovery requires an object schema; a root union is advertised as empty.
const workflowSubmissionInput = registeredWorkflowInput
  .partial()
  .extend({
    source: z.string().min(1).max(4096).optional(),
    idempotencyKey: id,
  })
  .superRefine((value, context) => {
    const schema =
      'source' in value ? sourceWorkflowInput : registeredWorkflowInput;
    if (!schema.safeParse(value).success)
      context.addIssue({
        code: 'custom',
        message:
          'Provide source, input, idempotencyKey and optional hostId, or the complete registered workflow envelope; do not mix forms.',
      });
  });

export class ControlGatewayError extends Error {
  override readonly name = 'ControlGatewayError';
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const unavailable = async (): Promise<never> => {
  throw new ControlGatewayError(
    'CONTROL_NOT_CONFIGURED',
    'Control plane is not configured.',
  );
};
const unconfigured: CodexControlPlane = {
  delegateAgent: unavailable,
  continueAgent: unavailable,
  sendAgentMessage: unavailable,
  runWorkflow: unavailable,
  cancelAgent: unavailable,
  cancelWorkflow: unavailable,
  snapshot: unavailable,
  wait: unavailable,
};

function redacted(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[bounded]';
  if (typeof value === 'string') return truncateUtf8(value, 4_096);
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => redacted(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !/(credential|secret|token|password|prompt|reasoning|environment|path)/i.test(
            key,
          ),
      )
      .slice(0, 100)
      .map(([key, item]) => [key, redacted(item, depth + 1)]),
  );
}

function truncateUtf8(value: string, maximumBytes: number): string {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maximumBytes) return value;
  const suffix = '…';
  const contentLimit = maximumBytes - Buffer.byteLength(suffix, 'utf8');
  let end = contentLimit;
  let bounded = bytes.subarray(0, end).toString('utf8');
  while (Buffer.byteLength(bounded, 'utf8') > contentLimit) {
    end -= 1;
    bounded = bytes.subarray(0, end).toString('utf8');
  }
  return `${bounded}${suffix}`;
}

function result(value: unknown) {
  const structured = redacted(value);
  const structuredContent =
    structured && typeof structured === 'object' && !Array.isArray(structured)
      ? (structured as Record<string, unknown>)
      : { value: structured };
  const text = JSON.stringify(structuredContent);
  return {
    content: [
      {
        type: 'text' as const,
        text: truncateUtf8(text, 8_192),
      },
    ],
    structuredContent,
  };
}

function presentation(
  baseUrl: string | undefined,
  kind: 'agents' | 'workflows',
  value: unknown,
  idKey: 'agentId' | 'runId',
): unknown {
  if (!baseUrl) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ControlGatewayError(
      'CONTROL_PRESENTATION_INVALID',
      'Control result cannot be presented.',
    );
  const idValue = (value as Record<string, unknown>)[idKey];
  if (typeof idValue !== 'string' || !id.safeParse(idValue).success)
    throw new ControlGatewayError(
      'CONTROL_PRESENTATION_INVALID',
      'Control result cannot be presented.',
    );
  return {
    ...(value as Record<string, unknown>),
    presentation: {
      browserUrl: `${baseUrl}/${kind}/${encodeURIComponent(idValue)}`,
    },
  };
}

async function invoke(
  operation: () => Promise<unknown>,
  present: (value: unknown) => unknown = (value) => value,
) {
  try {
    return result(present(await operation()));
  } catch (error) {
    const code =
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : 'CONTROL_OPERATION_FAILED';
    return {
      isError: true,
      content: [{ type: 'text' as const, text: JSON.stringify({ code }) }],
    };
  }
}

async function authorization(
  options: CodexControlServerOptions,
  tool: string,
  extra: HandlerExtra,
  scope: string,
) {
  const auth = await options.authorize(tool, extra);
  if (!auth.actorAgentId || !auth.scopes.includes(scope))
    throw new ControlGatewayError(
      'CONTROL_UNAUTHORIZED',
      'Control operation is not authorized.',
    );
  return auth;
}

export function createCodexControlServer(
  options: CodexControlServerOptions = {
    control: unconfigured,
    authorize: () => {
      throw new ControlGatewayError(
        'CONTROL_UNAUTHORIZED',
        'Control operation is not authorized.',
      );
    },
  },
): McpServer {
  let browserBaseUrl: string | undefined;
  if (options.browserBaseUrl !== undefined) {
    let candidate: URL;
    try {
      candidate = new URL(options.browserBaseUrl);
    } catch {
      throw new ControlGatewayError(
        'CONTROL_PRESENTATION_ORIGIN_INVALID',
        'Control presentation origin is invalid.',
      );
    }
    if (
      candidate.protocol !== 'http:' ||
      candidate.hostname !== '127.0.0.1' ||
      !candidate.port ||
      candidate.username ||
      candidate.password ||
      candidate.pathname !== '/' ||
      candidate.search ||
      candidate.hash
    )
      throw new ControlGatewayError(
        'CONTROL_PRESENTATION_ORIGIN_INVALID',
        'Control presentation origin is invalid.',
      );
    browserBaseUrl = candidate.origin;
  }
  const server = new McpServer({ name: 'codex-control', version: '0.1.0' });
  const annotations = (readOnlyHint: boolean, destructiveHint: boolean) => ({
    readOnlyHint,
    destructiveHint,
    idempotentHint: true,
    openWorldHint: false,
  });

  server.registerTool(
    'delegate_agent',
    {
      description:
        'Delegate one accepted assignment and return one stable agent handle.',
      inputSchema: z.strictObject({
        idempotencyKey: id,
        assignmentRef: id,
        assignmentDigest: digest,
        hostId: id,
        repositoryId: id,
        baseRevision: revision,
        assignmentId: id,
        model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,253}$/).optional(),
        reasoningEffort: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).optional(),
        sandbox: id.optional(),
        approvalPolicy: id.optional(),
        networkAccess: z.boolean().optional(),
        existingThread: z.strictObject({
          threadId: id,
          activeTurn: z.union([
            z.strictObject({ behavior: z.literal('reject') }),
            z.strictObject({ behavior: z.literal('steer'), expectedTurnId: id }),
          ]),
        }).optional(),
        completionBoundary: z.enum([
          'runtime-settled',
          'output-validated',
          'ready-for-audit',
        ]),
        prompt: z.string().min(1).max(65_536),
      }).superRefine((input, context) => {
        const runtime = input.model !== undefined && input.reasoningEffort !== undefined && input.sandbox !== undefined && input.approvalPolicy !== undefined;
        const adopted = input.existingThread !== undefined && input.model === undefined && input.reasoningEffort === undefined && input.sandbox === undefined && input.approvalPolicy === undefined && input.networkAccess === undefined;
        if (!runtime && !adopted) context.addIssue({ code: 'custom', message: 'Provide either a complete runtime profile or existingThread without runtime overrides.' });
      }),
      annotations: annotations(false, false),
    },
    (input, extra) =>
      invoke(
        async () =>
          options.control.delegateAgent(
            {
              idempotencyKey: input.idempotencyKey,
              assignmentRef: input.assignmentRef,
              assignmentDigest: input.assignmentDigest,
              hostId: input.hostId,
              workspace: {
                repositoryId: input.repositoryId,
                baseRevision: input.baseRevision,
                assignmentId: input.assignmentId,
              },
              ...(input.existingThread ? { existingThread: input.existingThread } : { runtimeProfile: {
                model: input.model,
                reasoningEffort: input.reasoningEffort,
                sandbox: input.sandbox,
                approvalPolicy: input.approvalPolicy,
                ...(input.networkAccess === undefined
                  ? {}
                  : { networkAccess: input.networkAccess }),
              } }),
              completionBoundary: input.completionBoundary,
              prompt: input.prompt,
            },
            await authorization(
              options,
              'delegate_agent',
              extra,
              'control:delegate',
            ),
          ),
        (value) => presentation(browserBaseUrl, 'agents', value, 'agentId'),
      ),
  );

  server.registerTool(
    'continue_agent',
    {
      description: 'Continue one delegated agent on its bound thread and return the same stable handle.',
      inputSchema: z.strictObject({ delegationId: id, prompt: z.string().min(1).max(65_536), expectedTurnId: id.optional() }),
      annotations: annotations(false, false),
    },
    (input, extra) => invoke(
      async () => {
        if (!options.control.continueAgent) return unavailable();
        return options.control.continueAgent(input, await authorization(options, 'continue_agent', extra, 'control:delegate'));
      },
      (value) => presentation(browserBaseUrl, 'agents', value, 'agentId'),
    ),
  );

  for (const [tool, kind] of [
    ['send_agent_message', 'send'],
    ['ask_agent', 'ask'],
    ['reply_agent', 'reply'],
  ] as const) {
    server.registerTool(
      tool,
      {
        description: `${kind} one durable addressed agent message and return its compact handle.`,
        inputSchema: z.strictObject(messageInput),
        annotations: annotations(false, false),
      },
      (input, extra) =>
        invoke(async () =>
          options.control.sendAgentMessage(
            kind,
            input,
            await authorization(options, tool, extra, 'control:message'),
          ),
        ),
    );
  }

  server.registerTool(
    'run_workflow',
    {
      description:
        'Submit one trusted workflow file using source, input and idempotencyKey (optional hostId), or the legacy registered envelope. Return one durable run handle.',
      inputSchema: workflowSubmissionInput,
      annotations: annotations(false, false),
    },
    (input, extra) =>
      invoke(
        async () =>
          options.control.runWorkflow(
            'source' in input
              ? input
              : {
                  workflowRef: input.workflowRef,
                  sourceDigest: input.sourceDigest,
                  input: input.input,
                  hostId: input.hostId,
                  workspace: {
                    repositoryId: input.repositoryId,
                    baseRevision: input.baseRevision,
                    assignmentId: input.assignmentId,
                  },
                  runtimeProfile: {
                    model: input.model,
                    reasoningEffort: input.reasoningEffort,
                    sandbox: input.sandbox,
                    approvalPolicy: 'never',
                  },
                  idempotencyKey: input.idempotencyKey,
                },
            await authorization(
              options,
              'run_workflow',
              extra,
              'control:workflow',
            ),
          ),
        (value) => presentation(browserBaseUrl, 'workflows', value, 'runId'),
      ),
  );

  server.registerTool(
    'cancel_agent',
    {
      description: 'Cancel one delegated agent after explicit confirmation.',
      inputSchema: z.strictObject({
        delegationId: id,
        confirm: z.literal(true),
      }),
      annotations: annotations(false, true),
    },
    (input, extra) =>
      invoke(async () =>
        options.control.cancelAgent(
          input.delegationId,
          await authorization(options, 'cancel_agent', extra, 'control:cancel'),
        ),
      ),
  );

  server.registerTool(
    'cancel_workflow',
    {
      description:
        'Request cancellation of one durable workflow after explicit confirmation.',
      inputSchema: z.strictObject({
        runId: z.string().regex(/^workflow_[a-f0-9]{64}$/),
        confirm: z.literal(true),
      }),
      annotations: annotations(false, true),
    },
    (input, extra) =>
      invoke(async () =>
        options.control.cancelWorkflow(
          input.runId,
          await authorization(
            options,
            'cancel_workflow',
            extra,
            'control:cancel',
          ),
        ),
      ),
  );

  server.registerTool(
    'get_control_snapshot',
    {
      description:
        'Read one bounded control-plane snapshot with optional selected-agent detail.',
      inputSchema: z.strictObject({
        selectedAgentId: id.optional(),
        selectionId: id.optional(),
      }),
      annotations: annotations(true, false),
    },
    (input, extra) =>
      invoke(async () =>
        options.control.snapshot(
          input,
          await authorization(
            options,
            'get_control_snapshot',
            extra,
            'control:read',
          ),
        ),
      ),
  );

  server.registerTool(
    'wait_control_delta',
    {
      description:
        'Wait for one bounded control-plane delta after a stable cursor.',
      inputSchema: z.strictObject({
        afterCursor: cursor,
        waitMs: z.number().int().min(0).max(30_000),
        selectedAgentId: id.optional(),
        selectionId: id.optional(),
      }),
      annotations: annotations(true, false),
    },
    (input, extra) =>
      invoke(async () =>
        options.control.wait(
          input,
          await authorization(
            options,
            'wait_control_delta',
            extra,
            'control:read',
          ),
          extra.signal,
        ),
      ),
  );

  return server;
}
