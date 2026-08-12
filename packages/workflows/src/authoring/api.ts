import { deepFreeze } from '../normalization/canonical.js';
import type {
  AgentOptions,
  ArtifactOptions,
  WorkflowArtifact,
  WorkflowDefinition,
  WorkflowDefinitionOptions,
  WorkflowRuntimeBridge,
} from './types.js';
import { WorkflowExecutionError } from './types.js';

const DEFINITION_MARKER = Symbol.for('@orchestration/workflows/definition/v1');
const RUNTIME_KEY = Symbol.for('@orchestration/workflows/runtime/v1');

type MarkedDefinition<Input, Output> = WorkflowDefinition<Input, Output> & {
  readonly [DEFINITION_MARKER]: true;
};

type WorkItem<Value> =
  | Value
  | PromiseLike<Value>
  | (() => Value | PromiseLike<Value>);

type ResolvedWorkItem<Value> = Value extends () => infer Result
  ? Awaited<Result>
  : Awaited<Value>;

function runtime(): WorkflowRuntimeBridge {
  const active = (globalThis as Record<PropertyKey, unknown>)[RUNTIME_KEY];
  if (!active) {
    throw new WorkflowExecutionError(
      'WORKFLOW_RUNTIME_UNAVAILABLE',
      'WORKFLOW_RUNTIME_UNAVAILABLE',
    );
  }
  return active as WorkflowRuntimeBridge;
}

function validId(id: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,127}$/.test(id);
}

export function defineWorkflow<Input, Output>(
  options: WorkflowDefinitionOptions<Input, Output>,
): WorkflowDefinition<Input, Output> {
  const version = options.version ?? 1;
  const maxConcurrency = options.maxConcurrency ?? 4;
  if (
    !validId(options.id) ||
    !Number.isInteger(version) ||
    version < 1 ||
    !Number.isInteger(maxConcurrency) ||
    maxConcurrency < 1 ||
    maxConcurrency > 64 ||
    typeof options.run !== 'function'
  ) {
    throw new WorkflowExecutionError(
      'WORKFLOW_DEFINITION_INVALID',
      'Workflow definition metadata is invalid.',
    );
  }
  const definition = {
    id: options.id,
    version,
    ...(options.description === undefined
      ? {}
      : { description: options.description }),
    maxConcurrency,
    ...(options.inputSchema === undefined
      ? {}
      : { inputSchema: deepFreeze(structuredClone(options.inputSchema)) }),
    run: options.run,
  } as MarkedDefinition<Input, Output>;
  Object.defineProperty(definition, DEFINITION_MARKER, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(definition);
}

export function isWorkflowDefinition(
  value: unknown,
): value is WorkflowDefinition<unknown, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<MarkedDefinition<unknown, unknown>>)[
      DEFINITION_MARKER
    ] === true &&
    typeof (value as WorkflowDefinition).run === 'function'
  );
}

export async function phase<Value>(
  name: string,
  callback: () => Promise<Value> | Value,
): Promise<Value> {
  return runtime().phase(name, callback);
}

function start<Value>(item: WorkItem<Value>): Promise<Value> {
  try {
    return Promise.resolve(
      typeof item === 'function'
        ? (item as () => Value | PromiseLike<Value>)()
        : item,
    );
  } catch (error) {
    return Promise.reject(error);
  }
}

export function parallel<const Values extends readonly unknown[]>(
  values: Values,
): Promise<{ -readonly [Key in keyof Values]: ResolvedWorkItem<Values[Key]> }>;
export function parallel<const Values extends Record<string, unknown>>(
  values: Values,
): Promise<{ [Key in keyof Values]: ResolvedWorkItem<Values[Key]> }>;
export async function parallel(
  values: readonly unknown[] | Record<string, unknown>,
): Promise<unknown> {
  if (Array.isArray(values)) {
    return Promise.all(values.map((value) => start(value)));
  }
  const entries = Object.entries(values);
  const results = await Promise.all(
    entries.map(async ([key, value]) => [key, await start(value)] as const),
  );
  return Object.fromEntries(results);
}

export async function agent<Output = string, Input = unknown>(
  options: AgentOptions<Input>,
): Promise<Output> {
  return runtime().agent<Output, Input>(options);
}

export async function artifact<Value>(
  name: string,
  valueOrOptions: Value | ArtifactOptions<Value>,
): Promise<WorkflowArtifact> {
  return runtime().artifact(name, valueOrOptions);
}

export function installWorkflowRuntime(
  bridge: WorkflowRuntimeBridge,
): () => void {
  const root = globalThis as Record<PropertyKey, unknown>;
  if (root[RUNTIME_KEY] !== undefined) {
    throw new WorkflowExecutionError(
      'WORKFLOW_DEFINITION_INVALID',
      'A workflow runtime is already active in this process.',
    );
  }
  root[RUNTIME_KEY] = bridge;
  return () => {
    if (root[RUNTIME_KEY] === bridge) delete root[RUNTIME_KEY];
  };
}
