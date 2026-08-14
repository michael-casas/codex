import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import { isAttestedCodexTurnResult } from '@codex/codex';

import type { JsonSchema, JsonValue } from '../lib/contracts.js';
import {
  canonicalizeJson,
  deepFreeze,
  sha256,
} from '../normalization/canonical.js';
import { installWorkflowRuntime, isWorkflowDefinition } from './api.js';
import type {
  AgentCommandEvidence,
  AgentCommandEvidencePolicy,
  AgentOptions,
  ArtifactOptions,
  ExecuteWorkflowOptions,
  FrozenWorkflowNode,
  WorkflowArtifact,
  WorkflowDefinition,
  WorkflowExecutionResult,
  WorkflowNodeOutcome,
  WorkflowNodeResult,
  WorkflowPublicEvent,
  WorkflowRuntimeBridge,
} from './types.js';
import { WorkflowExecutionError } from './types.js';

const MAX_PROMPT_LENGTH = 64_000;
const MAX_MODEL_LENGTH = 256;
const WORKFLOW_ERROR_CODES = new Set([
  'WORKFLOW_DEFINITION_INVALID',
  'WORKFLOW_INPUT_INVALID',
  'WORKFLOW_AGENT_FAILED',
  'WORKFLOW_ARTIFACT_FAILED',
  'WORKFLOW_OUTPUT_SCHEMA_FAILED',
  'WORKFLOW_CANCELLED',
  'WORKFLOW_RUNTIME_UNAVAILABLE',
]);

function attributedWorkflowError(
  value: unknown,
): WorkflowExecutionError | undefined {
  if (value instanceof WorkflowExecutionError) return value;
  if (typeof value !== 'object' || value === null || !('code' in value)) {
    return undefined;
  }
  const code = String(value.code);
  if (!WORKFLOW_ERROR_CODES.has(code)) return undefined;
  const message =
    'message' in value && typeof value.message === 'string'
      ? value.message
      : 'Attributed workflow execution failed.';
  const details =
    'details' in value &&
    typeof value.details === 'object' &&
    value.details !== null &&
    !Array.isArray(value.details)
      ? (value.details as Record<string, unknown>)
      : undefined;
  return new WorkflowExecutionError(
    code as WorkflowExecutionError['code'],
    message,
    details,
  );
}

function jsonValue(value: unknown, label: string): JsonValue {
  if (value === undefined) return null;
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch {
    encoded = undefined;
  }
  if (encoded === undefined) {
    throw new WorkflowExecutionError(
      'WORKFLOW_INPUT_INVALID',
      `${label} must be JSON serializable.`,
    );
  }
  return JSON.parse(encoded) as JsonValue;
}

function digest(value: unknown, label: string): `sha256:${string}` {
  return sha256(canonicalizeJson(jsonValue(value, label)));
}

function schemaValidator(schema: JsonSchema): ValidateFunction {
  try {
    return new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: false,
    }).compile(schema);
  } catch {
    throw new WorkflowExecutionError(
      'WORKFLOW_DEFINITION_INVALID',
      'A workflow JSON schema is invalid.',
    );
  }
}

export function validateWorkflowDefinitionInput(
  definition: WorkflowDefinition,
  input: unknown,
): void {
  if (!definition.inputSchema) return;
  if (!schemaValidator(definition.inputSchema)(input)) {
    throw new WorkflowExecutionError(
      'WORKFLOW_INPUT_INVALID',
      'Workflow input does not match inputSchema.',
    );
  }
}

function slug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return normalized || 'agent';
}

function validWorkflowModel(value: unknown): value is `gpt-${string}` {
  const hasUnsafeCharacter =
    typeof value === 'string' &&
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return /\s/u.test(character) || codePoint <= 0x1f || codePoint === 0x7f;
    });
  return (
    typeof value === 'string' &&
    value.startsWith('gpt-') &&
    value.length > 'gpt-'.length &&
    value.length <= MAX_MODEL_LENGTH &&
    !hasUnsafeCharacter
  );
}

function abortError(): WorkflowExecutionError {
  return new WorkflowExecutionError(
    'WORKFLOW_CANCELLED',
    'Workflow execution was cancelled.',
  );
}

class BoundedScheduler {
  private active = 0;
  private readonly idleWaiters = new Set<() => void>();
  private readonly queue: Array<{
    operation: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];

  constructor(
    private readonly concurrency: number,
    private readonly signal: AbortSignal,
  ) {
    signal.addEventListener(
      'abort',
      () => {
        const error = abortError();
        for (const queued of this.queue.splice(0)) queued.reject(error);
        this.notifyIdle();
      },
      { once: true },
    );
  }

  schedule<Value>(operation: () => Promise<Value>): Promise<Value> {
    if (this.signal.aborted) return Promise.reject(abortError());
    const promise = new Promise<unknown>((resolve, reject) => {
      this.queue.push({
        operation: operation as () => Promise<unknown>,
        resolve,
        reject,
      });
      this.drain();
    });
    return promise as Promise<Value>;
  }

  private drain(): void {
    while (
      !this.signal.aborted &&
      this.active < this.concurrency &&
      this.queue.length > 0
    ) {
      const queued = this.queue.shift();
      if (!queued) break;
      this.active += 1;
      void queued
        .operation()
        .then(queued.resolve, queued.reject)
        .finally(() => {
          this.active -= 1;
          this.drain();
          this.notifyIdle();
        });
    }
  }

  waitForIdle(): Promise<void> {
    if (this.active === 0 && this.queue.length === 0) return Promise.resolve();
    return new Promise<void>((resolveIdle) =>
      this.idleWaiters.add(resolveIdle),
    );
  }

  private notifyIdle(): void {
    if (this.active !== 0 || this.queue.length !== 0) return;
    for (const waiter of this.idleWaiters) waiter();
    this.idleWaiters.clear();
  }
}

class ActivityBarrier {
  private active = 0;
  private readonly idleWaiters = new Set<() => void>();

  begin(): () => void {
    this.active += 1;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.active -= 1;
      if (this.active !== 0) return;
      for (const waiter of this.idleWaiters) waiter();
      this.idleWaiters.clear();
    };
  }

  waitForIdle(): Promise<void> {
    if (this.active === 0) return Promise.resolve();
    return new Promise<void>((resolveIdle) =>
      this.idleWaiters.add(resolveIdle),
    );
  }
}

interface LineageState {
  readonly objects: WeakMap<object, Set<string>>;
  readonly primitives: Map<string, Set<string>>;
}

function dependenciesFor(input: unknown, lineage: LineageState): string[] {
  const dependencies = new Set<string>();
  const visit = (value: unknown): void => {
    const structured = typeof value === 'object' && value !== null;
    if (structured) {
      for (const id of lineage.objects.get(value) ?? []) dependencies.add(id);
    } else {
      try {
        const ids = lineage.primitives.get(digest(value, 'Agent input'));
        if ((ids?.size ?? 0) > 1) {
          throw new WorkflowExecutionError(
            'WORKFLOW_DEFINITION_INVALID',
            'Agent input has ambiguous primitive provenance.',
          );
        }
        for (const id of ids ?? []) dependencies.add(id);
      } catch (error) {
        if (error instanceof WorkflowExecutionError) throw error;
        // The full input validation below owns non-serializable value failure.
      }
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (structured) {
      Object.values(value).forEach(visit);
    }
  };
  visit(input);
  return [...dependencies].sort();
}

function registerLineage(
  output: unknown,
  nodeId: string,
  lineage: LineageState,
): void {
  if (typeof output === 'object' && output !== null) {
    const ids = lineage.objects.get(output) ?? new Set<string>();
    ids.add(nodeId);
    lineage.objects.set(output, ids);
    return;
  }
  const key = digest(output, 'Agent output');
  const ids = lineage.primitives.get(key) ?? new Set<string>();
  ids.add(nodeId);
  lineage.primitives.set(key, ids);
}

function validateHostCompatibleSchema(schema: JsonSchema): void {
  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return;
    }
    const node = value as Record<string, unknown>;
    if (Object.hasOwn(node, 'const') && typeof node.type !== 'string') {
      throw new WorkflowExecutionError(
        'WORKFLOW_DEFINITION_INVALID',
        'A workflow output schema is not compatible with the Codex host.',
      );
    }
    const properties = node.properties;
    if (typeof properties === 'object' && properties !== null) {
      Object.values(properties).forEach(visit);
    }
    if (node.items !== undefined) visit(node.items);
    for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
      const branches = node[keyword];
      if (Array.isArray(branches)) branches.forEach(visit);
    }
  };
  visit(schema);
}

function effectivePrompt(prompt: string, input: unknown): string {
  if (input === undefined) return prompt;
  const encoded = canonicalizeJson(jsonValue(input, 'Agent input'));
  return `${prompt}\n\n<workflow-input-json>\n${encoded}\n</workflow-input-json>`;
}

function parseOutput(
  response: string,
  schema: JsonSchema | undefined,
): unknown {
  if (!schema) return response;
  let value: unknown;
  try {
    value = JSON.parse(response) as unknown;
  } catch {
    throw new WorkflowExecutionError(
      'WORKFLOW_OUTPUT_SCHEMA_FAILED',
      'Agent output is not valid schema-bound JSON.',
    );
  }
  if (!schemaValidator(schema)(value)) {
    throw new WorkflowExecutionError(
      'WORKFLOW_OUTPUT_SCHEMA_FAILED',
      'Agent output does not match outputSchema.',
    );
  }
  return value;
}

function commandEvidencePolicyDigest(
  policy: AgentCommandEvidencePolicy,
): `sha256:${string}` {
  return digest(policy, 'Agent command evidence policy');
}

function validateCommandEvidencePolicy(
  policy: AgentCommandEvidencePolicy,
): void {
  if (
    !Array.isArray(policy.rules) ||
    policy.rules.length < 1 ||
    policy.rules.length > 32
  ) {
    throw new WorkflowExecutionError(
      'WORKFLOW_DEFINITION_INVALID',
      'Agent command evidence policy must contain 1 through 32 rules.',
    );
  }
  const ids = new Set<string>();
  for (const rule of policy.rules) {
    if (
      !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(rule.id) ||
      ids.has(rule.id) ||
      typeof rule.includes !== 'string' ||
      rule.includes.length < 1 ||
      rule.includes.length > 4096 ||
      !Number.isInteger(rule.expectedCount) ||
      rule.expectedCount < 0 ||
      rule.expectedCount > 64
    ) {
      throw new WorkflowExecutionError(
        'WORKFLOW_DEFINITION_INVALID',
        'Agent command evidence rule is invalid.',
      );
    }
    ids.add(rule.id);
  }
}

function occurrenceCount(source: string, needle: string): number {
  let count = 0;
  let offset = 0;
  while (offset <= source.length - needle.length) {
    const next = source.indexOf(needle, offset);
    if (next < 0) break;
    count += 1;
    offset = next + needle.length;
  }
  return count;
}

function deriveCommandEvidence(
  policy: AgentCommandEvidencePolicy,
  runtimeTurn: unknown,
  hostProjection: AgentCommandEvidence | undefined,
): AgentCommandEvidence {
  if (hostProjection !== undefined || !isAttestedCodexTurnResult(runtimeTurn)) {
    throw new WorkflowExecutionError(
      'WORKFLOW_AGENT_FAILED',
      'Agent command evidence requires an attested Codex runtime turn.',
    );
  }
  const policyDigest = commandEvidencePolicyDigest(policy);
  const commands = runtimeTurn.events
    .filter(
      (event) =>
        event.type === 'item.completed' &&
        event.item?.type === 'command_execution' &&
        typeof event.item.command === 'string',
    )
    .map((event) => event.item?.command ?? '');
  const body = {
    schemaVersion: 1 as const,
    policyDigest,
    totalCompletedCommands: commands.length,
    commandDigests: commands.map((command) => sha256(command)),
    rules: policy.rules.map((rule) => {
      const observedCount = commands.reduce(
        (sum, command) => sum + occurrenceCount(command, rule.includes),
        0,
      );
      return {
        id: rule.id,
        expectedCount: rule.expectedCount,
        observedCount,
        passed: observedCount === rule.expectedCount,
      };
    }),
  };
  const evidence: AgentCommandEvidence = {
    ...body,
    digest: digest(body, 'Agent command evidence'),
  };
  const { digest: declaredDigest, ...digestInput } = evidence;
  const exactRules =
    evidence.rules.length === policy.rules.length &&
    policy.rules.every((rule, index) => {
      const actual = evidence.rules[index];
      return (
        actual?.id === rule.id &&
        actual.expectedCount === rule.expectedCount &&
        Number.isInteger(actual.observedCount) &&
        actual.observedCount >= 0 &&
        actual.passed === (actual.observedCount === rule.expectedCount)
      );
    });
  const valid =
    evidence.schemaVersion === 1 &&
    evidence.policyDigest === policyDigest &&
    Number.isInteger(evidence.totalCompletedCommands) &&
    evidence.totalCompletedCommands >= 0 &&
    evidence.commandDigests.every((value) =>
      /^sha256:[a-f0-9]{64}$/.test(value),
    ) &&
    evidence.commandDigests.length === evidence.totalCompletedCommands &&
    exactRules &&
    evidence.rules.every((rule) => rule.passed) &&
    /^sha256:[a-f0-9]{64}$/.test(declaredDigest) &&
    digest(digestInput, 'Agent command evidence') === declaredDigest;
  if (!valid) {
    throw new WorkflowExecutionError(
      'WORKFLOW_AGENT_FAILED',
      'Agent command evidence failed closed.',
    );
  }
  return evidence;
}

function artifactRequest(valueOrOptions: unknown): {
  value: unknown;
  mediaType?: string;
  publishPath?: string;
} {
  if (
    typeof valueOrOptions === 'object' &&
    valueOrOptions !== null &&
    Object.hasOwn(valueOrOptions, 'value')
  ) {
    const options = valueOrOptions as ArtifactOptions;
    return {
      value: options.value,
      ...(options.mediaType === undefined
        ? {}
        : { mediaType: options.mediaType }),
      ...(options.publishPath === undefined
        ? {}
        : { publishPath: options.publishPath }),
    };
  }
  return { value: valueOrOptions };
}

export async function executeWorkflow<Input, Output>(
  definition: WorkflowDefinition<Input, Output>,
  input: Input,
  options: ExecuteWorkflowOptions,
): Promise<WorkflowExecutionResult<Output>> {
  if (!isWorkflowDefinition(definition)) {
    throw new WorkflowExecutionError(
      'WORKFLOW_DEFINITION_INVALID',
      'The loaded module does not export a defined workflow.',
    );
  }
  validateWorkflowDefinitionInput(definition, input);
  const now = options.now ?? (() => new Date());
  const startedAtMs = now().getTime();
  const controller = new AbortController();
  let externalAbort: (() => void) | undefined;
  if (options.signal) {
    externalAbort = () => controller.abort(options.signal?.reason);
    if (options.signal.aborted) externalAbort();
    else
      options.signal.addEventListener('abort', externalAbort, { once: true });
  }
  const scheduler = new BoundedScheduler(
    definition.maxConcurrency,
    controller.signal,
  );
  const activity = new ActivityBarrier();
  const lineage: LineageState = {
    objects: new WeakMap<object, Set<string>>(),
    primitives: new Map<string, Set<string>>(),
  };
  const nodes: WorkflowNodeResult[] = [];
  const artifacts: WorkflowArtifact[] = [];
  let sequence = 0;
  let ordinal = 0;
  let currentPhase: string | undefined;
  let firstFailure: WorkflowExecutionError | undefined;

  const emit = async (
    event: Omit<WorkflowPublicEvent, 'sequence' | 'at' | 'runId'>,
  ): Promise<void> => {
    sequence += 1;
    await options.onEvent(
      deepFreeze({
        sequence,
        at: now().toISOString(),
        runId: options.runId,
        ...event,
      }) as WorkflowPublicEvent,
    );
  };

  const failRun = (error: WorkflowExecutionError): WorkflowExecutionError => {
    if (!firstFailure) firstFailure = error;
    if (!controller.signal.aborted) controller.abort(error);
    return firstFailure;
  };

  const bridge: WorkflowRuntimeBridge = {
    async phase<Value>(name: string, callback: () => Promise<Value> | Value) {
      if (!name.trim()) {
        throw new WorkflowExecutionError(
          'WORKFLOW_DEFINITION_INVALID',
          'Phase name must not be empty.',
        );
      }
      const prior = currentPhase;
      currentPhase = name;
      const phaseStarted = now().getTime();
      await emit({ type: 'phase.started', phase: name });
      try {
        const value = await callback();
        await emit({
          type: 'phase.completed',
          phase: name,
          durationMs: Math.max(0, now().getTime() - phaseStarted),
        });
        return value;
      } catch (error) {
        await emit({
          type: 'phase.failed',
          phase: name,
          durationMs: Math.max(0, now().getTime() - phaseStarted),
          diagnostic: controller.signal.aborted ? 'cancelled' : 'agent-failed',
        });
        throw error;
      } finally {
        currentPhase = prior;
      }
    },
    async agent<Result, AgentInput>(
      request: AgentOptions<AgentInput>,
    ): Promise<Result> {
      const finishActivity = activity.begin();
      try {
        if (
          !request.label.trim() ||
          !validWorkflowModel(request.model) ||
          request.reasoning !== 'medium' ||
          !request.prompt ||
          request.prompt.length > MAX_PROMPT_LENGTH
        ) {
          throw new WorkflowExecutionError(
            'WORKFLOW_DEFINITION_INVALID',
            'Agent label, model, reasoning, or prompt is invalid.',
          );
        }
        if (request.outputSchema) {
          schemaValidator(request.outputSchema);
          validateHostCompatibleSchema(request.outputSchema);
        }
        if (request.commandEvidence) {
          validateCommandEvidencePolicy(request.commandEvidence);
        }
        ordinal += 1;
        const nodeId = `${definition.id}:${String(ordinal).padStart(3, '0')}:${slug(request.label)}`;
        const dependencies = dependenciesFor(request.input, lineage);
        const frozenAt = now().toISOString();
        const frozen: FrozenWorkflowNode = deepFreeze({
          id: nodeId,
          ordinal,
          label: request.label,
          ...(currentPhase ? { phase: currentPhase } : {}),
          dependencies,
          model: request.model,
          reasoning: request.reasoning,
          promptDigest: sha256(request.prompt),
          inputDigest: digest(request.input, 'Agent input'),
          ...(request.outputSchema
            ? {
                outputSchemaDigest: digest(
                  request.outputSchema,
                  'Agent output schema',
                ),
              }
            : {}),
          ...(request.commandEvidence
            ? {
                commandEvidencePolicyDigest: commandEvidencePolicyDigest(
                  request.commandEvidence,
                ),
              }
            : {}),
          frozenAt,
        });
        await emit({ type: 'node.frozen', node: frozen });

        try {
          return await scheduler.schedule(async () => {
            if (controller.signal.aborted) throw abortError();
            const nodeStartedMs = now().getTime();
            const nodeStartedAt = now().toISOString();
            await emit({ type: 'node.started', nodeId });
            try {
              const operationController = new AbortController();
              const relayAbort = () =>
                operationController.abort(controller.signal.reason);
              if (controller.signal.aborted) relayAbort();
              else {
                controller.signal.addEventListener('abort', relayAbort, {
                  once: true,
                });
              }
              let response;
              try {
                response = await options.executeAgent({
                  ...request,
                  prompt: effectivePrompt(request.prompt, request.input),
                  signal: operationController.signal,
                });
              } finally {
                controller.signal.removeEventListener('abort', relayAbort);
              }
              const commandEvidence = request.commandEvidence
                ? deriveCommandEvidence(
                    request.commandEvidence,
                    response.runtimeTurn,
                    response.commandEvidence,
                  )
                : undefined;
              if (
                request.commandEvidence &&
                isAttestedCodexTurnResult(response.runtimeTurn) &&
                (response.threadId !== response.runtimeTurn.threadId ||
                  response.finalResponse !== response.runtimeTurn.finalResponse ||
                  digest(response.usage, 'Agent usage') !==
                    digest(response.runtimeTurn.usage, 'Runtime turn usage'))
              ) {
                throw new WorkflowExecutionError(
                  'WORKFLOW_AGENT_FAILED',
                  'Agent result does not match its attested runtime turn.',
                );
              }
              const output = parseOutput(
                response.finalResponse,
                request.outputSchema,
              ) as Result;
              const outputDigest = digest(output, 'Agent output');
              registerLineage(output, nodeId, lineage);
              const completedAt = now().toISOString();
              const durationMs = Math.max(0, now().getTime() - nodeStartedMs);
              const result: WorkflowNodeResult = deepFreeze({
                ...frozen,
                startedAt: nodeStartedAt,
                completedAt,
                durationMs,
                outcome: 'completed',
                outputDigest,
                ...(commandEvidence ? { commandEvidence } : {}),
              });
              nodes.push(result);
              await emit({
                type: 'node.completed',
                nodeId,
                outcome: 'completed',
                durationMs,
                outputDigest,
                ...(commandEvidence ? { commandEvidence } : {}),
              });
              return output;
            } catch (caught) {
              const isSchema =
                caught instanceof WorkflowExecutionError &&
                caught.code === 'WORKFLOW_OUTPUT_SCHEMA_FAILED';
              const cancelled =
                controller.signal.aborted &&
                !isSchema &&
                (firstFailure !== undefined ||
                  options.signal?.aborted === true);
              const failure = cancelled
                ? abortError()
                : isSchema
                  ? caught
                  : new WorkflowExecutionError(
                      'WORKFLOW_AGENT_FAILED',
                      'A workflow agent failed.',
                    );
              const outcome: WorkflowNodeOutcome = cancelled
                ? 'cancelled'
                : 'failed';
              const diagnostic = isSchema
                ? 'output-schema-failed'
                : cancelled
                  ? 'cancelled'
                  : 'agent-failed';
              const completedAt = now().toISOString();
              const durationMs = Math.max(0, now().getTime() - nodeStartedMs);
              nodes.push(
                deepFreeze({
                  ...frozen,
                  startedAt: nodeStartedAt,
                  completedAt,
                  durationMs,
                  outcome,
                  diagnostic,
                }),
              );
              await emit({
                type:
                  outcome === 'cancelled' ? 'node.cancelled' : 'node.failed',
                nodeId,
                outcome,
                durationMs,
                diagnostic,
              });
              if (cancelled) throw failure;
              throw failRun(failure);
            }
          });
        } catch (caught) {
          if (
            caught instanceof WorkflowExecutionError &&
            caught.code === 'WORKFLOW_CANCELLED' &&
            !nodes.some((node) => node.id === nodeId)
          ) {
            const completedAt = now().toISOString();
            nodes.push(
              deepFreeze({
                ...frozen,
                completedAt,
                durationMs: 0,
                outcome: 'cancelled',
                diagnostic: 'cancelled',
              }),
            );
            await emit({
              type: 'node.cancelled',
              nodeId,
              outcome: 'cancelled',
              durationMs: 0,
              diagnostic: 'cancelled',
            });
          }
          throw firstFailure ?? caught;
        }
      } finally {
        finishActivity();
      }
    },
    async artifact(name, valueOrOptions) {
      const finishActivity = activity.begin();
      try {
        if (controller.signal.aborted) throw firstFailure ?? abortError();
        const request = artifactRequest(valueOrOptions);
        let written: WorkflowArtifact;
        try {
          written = deepFreeze(
            await options.writeArtifact({ name, ...request }),
          );
        } catch (error) {
          if (error instanceof WorkflowExecutionError) throw error;
          throw new WorkflowExecutionError(
            'WORKFLOW_ARTIFACT_FAILED',
            'A workflow artifact could not be published.',
            {
              storageCode:
                typeof error === 'object' && error !== null && 'code' in error
                  ? String(error.code)
                  : 'UNKNOWN',
            },
          );
        }
        artifacts.push(written);
        await emit({ type: 'artifact.created', artifact: written });
        return written;
      } finally {
        finishActivity();
      }
    },
  };

  const uninstall = installWorkflowRuntime(bridge);
  await emit({ type: 'workflow.started' });
  try {
    const output = await definition.run(input);
    if (controller.signal.aborted) throw firstFailure ?? abortError();
    await scheduler.waitForIdle();
    await activity.waitForIdle();
    await emit({
      type: 'workflow.completed',
      durationMs: Math.max(0, now().getTime() - startedAtMs),
    });
    return deepFreeze({
      status: 'completed',
      output,
      nodes: [...nodes],
      artifacts: [...artifacts],
    });
  } catch (caught) {
    const caughtError = attributedWorkflowError(caught);
    const initialError =
      firstFailure ??
      (controller.signal.aborted
        ? abortError()
        : caughtError
          ? caughtError
          : new WorkflowExecutionError(
              'WORKFLOW_AGENT_FAILED',
              'Workflow execution failed.',
            ));
    if (!controller.signal.aborted) controller.abort(initialError);
    await scheduler.waitForIdle();
    await activity.waitForIdle();
    const error = firstFailure ?? initialError;
    await emit({
      type:
        error.code === 'WORKFLOW_CANCELLED'
          ? 'workflow.cancelled'
          : 'workflow.failed',
      durationMs: Math.max(0, now().getTime() - startedAtMs),
      diagnostic:
        error.code === 'WORKFLOW_CANCELLED'
          ? 'cancelled'
          : error.code === 'WORKFLOW_ARTIFACT_FAILED'
            ? 'artifact-failed'
            : error.code === 'WORKFLOW_OUTPUT_SCHEMA_FAILED'
              ? 'output-schema-failed'
              : 'agent-failed',
    });
    throw error;
  } finally {
    uninstall();
    if (options.signal && externalAbort) {
      options.signal.removeEventListener('abort', externalAbort);
    }
  }
}
