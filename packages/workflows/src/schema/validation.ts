import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';

import {
  WorkflowValidationError,
  type JsonSchema,
  type JsonValue,
  type WorkflowHandler,
  type WorkflowIssue,
  type WorkflowSource,
  type WorkflowStep,
} from '../lib/contracts.js';

const MAX_STEPS = 256;
const MAX_TOTAL_STEPS = 1_024;
const MAX_WORKFLOW_DEPTH = 8;
const MAX_SCHEMA_DEPTH = 32;
const MAX_PROMPT_LENGTH = 16_000;
const REGISTERED_HANDLERS = new Set(['identity', 'collect']);
const UNSAFE_POINTER_SEGMENTS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const conditionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pointer', 'operator'],
  properties: {
    pointer: { type: 'string' },
    operator: { enum: ['exists', 'equals', 'not-equals'] },
    value: true,
  },
};

const handlerSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'name'],
      properties: {
        type: { const: 'registered' },
        name: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'prompt'],
      properties: {
        type: { const: 'codex' },
        prompt: { type: 'string' },
        model: { type: 'string' },
      },
    },
  ],
};

const commonStepProperties = {
  id: { type: 'string' },
  dependsOn: { type: 'array', items: { type: 'string' }, uniqueItems: true },
  condition: conditionSchema,
};

const workflowEnvelopeSchema: JsonSchema = {
  $id: 'urn:orchestration:workflow-source:v1',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'id',
    'version',
    'inputSchema',
    'policy',
    'steps',
  ],
  properties: {
    schemaVersion: { const: 1 },
    id: { type: 'string' },
    version: { type: 'integer', minimum: 1 },
    description: { type: 'string', maxLength: 4_096 },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: {
      type: 'object',
      additionalProperties: false,
      required: [
        'maxConcurrentSteps',
        'maxAttempts',
        'sandbox',
        'approval',
        'network',
        'allowedRoots',
        'allowedModels',
      ],
      properties: {
        maxConcurrentSteps: { type: 'integer' },
        maxAttempts: { type: 'integer' },
        sandbox: { enum: ['read-only', 'workspace-write'] },
        approval: { enum: ['never', 'on-request'] },
        network: { enum: ['disabled', 'enabled'] },
        allowedRoots: {
          type: 'array',
          minItems: 1,
          maxItems: 32,
          uniqueItems: true,
          items: { type: 'string' },
        },
        allowedModels: {
          type: 'array',
          minItems: 1,
          maxItems: 32,
          uniqueItems: true,
          items: { type: 'string' },
        },
      },
    },
    steps: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_STEPS,
      items: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'kind', 'handler'],
            properties: {
              ...commonStepProperties,
              kind: { const: 'task' },
              handler: handlerSchema,
              outputSchema: { type: 'object' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: [
              'id',
              'kind',
              'from',
              'itemKey',
              'maxItems',
              'concurrency',
              'handler',
            ],
            properties: {
              ...commonStepProperties,
              kind: { const: 'fan-out' },
              from: { type: 'string' },
              itemKey: { type: 'string' },
              maxItems: { type: 'integer', minimum: 1, maximum: 1_024 },
              concurrency: { type: 'integer', minimum: 1, maximum: 64 },
              handler: handlerSchema,
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'kind', 'dependsOn', 'mode'],
            properties: {
              ...commonStepProperties,
              kind: { const: 'join' },
              mode: { enum: ['all', 'any'] },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'kind', 'workflow'],
            properties: {
              ...commonStepProperties,
              kind: { const: 'subworkflow' },
              workflow: { $ref: 'urn:orchestration:workflow-source:v1' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: [
              'id',
              'kind',
              'sourceStep',
              'mediaType',
              'redaction',
              'retention',
            ],
            properties: {
              ...commonStepProperties,
              kind: { const: 'artifact' },
              sourceStep: { type: 'string' },
              mediaType: { type: 'string' },
              redaction: { enum: ['public', 'internal', 'sensitive'] },
              retention: { enum: ['ephemeral', 'campaign', 'permanent'] },
            },
          },
        ],
      },
    },
  },
};

const envelopeAjv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: false,
});
const validateEnvelope = envelopeAjv.compile(workflowEnvelopeSchema);

function issue(code: string, path: string, message: string): WorkflowIssue {
  return { code, path, message };
}

function envelopeIssues(
  errors: ErrorObject[] | null | undefined,
): WorkflowIssue[] {
  return (errors ?? []).map((error) =>
    issue(
      'SOURCE_SCHEMA_INVALID',
      error.instancePath || '',
      error.message ?? 'Workflow source does not match schema version 1.',
    ),
  );
}

function walkSchema(
  value: unknown,
  path: string,
  depth: number,
  issues: WorkflowIssue[],
): void {
  if (depth > MAX_SCHEMA_DEPTH) {
    issues.push(
      issue('SCHEMA_DEPTH_EXCEEDED', path, 'Schema depth exceeds 32.'),
    );
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkSchema(item, `${path}/${index}`, depth + 1, issues),
    );
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
    if (key === '$ref' && typeof child === 'string' && !child.startsWith('#')) {
      issues.push(
        issue(
          'REMOTE_SCHEMA_REFERENCE',
          childPath,
          'Remote schema references are forbidden.',
        ),
      );
    }
    if (
      key === '$data' ||
      key === 'format' ||
      key === 'formatMaximum' ||
      key === 'formatMinimum'
    ) {
      issues.push(
        issue(
          'EXECUTABLE_SCHEMA_KEYWORD',
          childPath,
          'Executable schema extensions are forbidden.',
        ),
      );
    }
    walkSchema(child, childPath, depth + 1, issues);
  }
}

function compileSchema(
  schema: JsonSchema,
  path: string,
  issues: WorkflowIssue[],
): void {
  try {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: false,
    });
    ajv.compile(schema);
  } catch (error) {
    issues.push(
      issue(
        'SCHEMA_COMPILE_INVALID',
        path,
        error instanceof Error ? error.message : 'Schema compilation failed.',
      ),
    );
  }
}

export function safePointer(pointer: string): boolean {
  if (!pointer.startsWith('/')) return false;
  const rawSegments = pointer.slice(1).split('/');
  for (const segment of rawSegments) {
    for (let index = 0; index < segment.length; index += 1) {
      if (
        segment[index] === '~' &&
        segment[index + 1] !== '0' &&
        segment[index + 1] !== '1'
      ) {
        return false;
      }
    }
  }
  const segments = rawSegments.map((segment) =>
    segment.replaceAll('~1', '/').replaceAll('~0', '~'),
  );
  return segments.every(
    (segment) => segment.length > 0 && !UNSAFE_POINTER_SEGMENTS.has(segment),
  );
}

function validateHandler(
  handler: WorkflowHandler,
  source: WorkflowSource,
  path: string,
  issues: WorkflowIssue[],
): void {
  if (handler.type === 'registered' && !REGISTERED_HANDLERS.has(handler.name)) {
    issues.push(
      issue('UNKNOWN_HANDLER', `${path}/name`, 'Handler is not registered.'),
    );
  }
  if (handler.type === 'codex') {
    if (
      handler.prompt.length === 0 ||
      handler.prompt.length > MAX_PROMPT_LENGTH
    ) {
      issues.push(
        issue(
          'PROMPT_LENGTH_INVALID',
          `${path}/prompt`,
          'Prompt length is invalid.',
        ),
      );
    }
    if (handler.model && !source.policy.allowedModels.includes(handler.model)) {
      issues.push(
        issue(
          'MODEL_NOT_ALLOWED',
          `${path}/model`,
          'Model is not in policy.allowedModels.',
        ),
      );
    }
  }
}

function validateStepDetails(
  step: WorkflowStep,
  source: WorkflowSource,
  index: number,
  issues: WorkflowIssue[],
  basePath: string,
  workflowDepth: number,
  total: { steps: number },
): void {
  const path = `${basePath}/steps/${index}`;
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(step.id)) {
    issues.push(issue('STEP_ID_INVALID', `${path}/id`, 'Step ID is invalid.'));
  }
  if (step.condition && !safePointer(step.condition.pointer)) {
    issues.push(
      issue(
        'UNSAFE_JSON_POINTER',
        `${path}/condition/pointer`,
        'Condition pointer is unsafe.',
      ),
    );
  }
  if (
    step.condition &&
    step.condition.operator !== 'exists' &&
    !Object.hasOwn(step.condition, 'value')
  ) {
    issues.push(
      issue(
        'CONDITION_VALUE_REQUIRED',
        `${path}/condition/value`,
        'Equality conditions require a comparison value.',
      ),
    );
  }
  if (step.kind === 'task') {
    validateHandler(step.handler, source, `${path}/handler`, issues);
    if (step.outputSchema) {
      walkSchema(step.outputSchema, `${path}/outputSchema`, 0, issues);
      compileSchema(step.outputSchema, `${path}/outputSchema`, issues);
    }
  } else if (step.kind === 'fan-out') {
    if (!safePointer(step.from) || !safePointer(step.itemKey)) {
      issues.push(
        issue('UNSAFE_JSON_POINTER', path, 'Fan-out pointers are unsafe.'),
      );
    }
    if (step.concurrency > source.policy.maxConcurrentSteps) {
      issues.push(
        issue(
          'FAN_OUT_CONCURRENCY_INVALID',
          `${path}/concurrency`,
          'Fan-out concurrency exceeds policy.',
        ),
      );
    }
    validateHandler(step.handler, source, `${path}/handler`, issues);
  } else if (step.kind === 'join' && step.dependsOn.length === 0) {
    issues.push(
      issue(
        'JOIN_DEPENDENCIES_REQUIRED',
        `${path}/dependsOn`,
        'Join requires dependencies.',
      ),
    );
  } else if (step.kind === 'subworkflow') {
    if (workflowDepth >= MAX_WORKFLOW_DEPTH) {
      issues.push(
        issue(
          'WORKFLOW_DEPTH_EXCEEDED',
          `${path}/workflow`,
          `Subworkflow nesting exceeds ${MAX_WORKFLOW_DEPTH}.`,
        ),
      );
    } else {
      validateWorkflowSource(
        step.workflow,
        `${path}/workflow`,
        issues,
        workflowDepth + 1,
        total,
      );
    }
  } else if (step.kind === 'artifact') {
    if (
      !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(
        step.mediaType,
      )
    ) {
      issues.push(
        issue(
          'MEDIA_TYPE_INVALID',
          `${path}/mediaType`,
          'Artifact media type is invalid.',
        ),
      );
    }
    if (!(step.dependsOn ?? []).includes(step.sourceStep)) {
      issues.push(
        issue(
          'ARTIFACT_DEPENDENCY_REQUIRED',
          `${path}/dependsOn`,
          'Artifact must depend explicitly on sourceStep.',
        ),
      );
    }
  }
}

function validateGraph(
  source: WorkflowSource,
  issues: WorkflowIssue[],
  basePath: string,
): void {
  const byId = new Map<string, WorkflowStep>();
  source.steps.forEach((step, index) => {
    if (byId.has(step.id)) {
      issues.push(
        issue(
          'DUPLICATE_STEP_ID',
          `${basePath}/steps/${index}/id`,
          'Step ID is duplicated.',
        ),
      );
    } else {
      byId.set(step.id, step);
    }
  });
  source.steps.forEach((step, index) => {
    for (const dependency of step.dependsOn ?? []) {
      if (dependency === step.id) {
        issues.push(
          issue(
            'SELF_DEPENDENCY',
            `${basePath}/steps/${index}/dependsOn`,
            'Step depends on itself.',
          ),
        );
      } else if (!byId.has(dependency)) {
        issues.push(
          issue(
            'MISSING_DEPENDENCY',
            `${basePath}/steps/${index}/dependsOn`,
            'Dependency does not exist.',
          ),
        );
      }
    }
    if (step.kind === 'artifact' && !byId.has(step.sourceStep)) {
      issues.push(
        issue(
          'MISSING_ARTIFACT_SOURCE',
          `${basePath}/steps/${index}/sourceStep`,
          'Artifact source does not exist.',
        ),
      );
    }
  });

  const indegree = new Map(source.steps.map((step) => [step.id, 0]));
  const outgoing = new Map(
    source.steps.map((step) => [step.id, [] as string[]]),
  );
  for (const step of source.steps) {
    for (const dependency of step.dependsOn ?? []) {
      if (!indegree.has(dependency) || dependency === step.id) continue;
      indegree.set(step.id, (indegree.get(step.id) ?? 0) + 1);
      outgoing.get(dependency)?.push(step.id);
    }
  }
  source.steps.forEach((step, index) => {
    if (!step.condition) return;
    const pending = [...(outgoing.get(step.id) ?? [])];
    const seen = new Set<string>();
    let reachesJoin = false;
    while (pending.length > 0 && !reachesJoin) {
      const next = pending.shift();
      if (!next || seen.has(next)) continue;
      seen.add(next);
      if (byId.get(next)?.kind === 'join') {
        reachesJoin = true;
        break;
      }
      pending.push(...(outgoing.get(next) ?? []));
    }
    if (!reachesJoin) {
      issues.push(
        issue(
          'CONDITIONAL_JOIN_REQUIRED',
          `${basePath}/steps/${index}/condition`,
          'Conditional step must reach an explicit downstream join.',
        ),
      );
    }
  });
  const ready = [...indegree.entries()]
    .filter(([, value]) => value === 0)
    .map(([id]) => id)
    .sort();
  let visited = 0;
  while (ready.length > 0) {
    const id = ready.shift();
    if (!id) break;
    visited += 1;
    for (const next of (outgoing.get(id) ?? []).sort()) {
      const value = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, value);
      if (value === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }
  if (visited !== source.steps.length) {
    issues.push(
      issue(
        'DEPENDENCY_CYCLE',
        `${basePath}/steps`,
        'Workflow dependency graph contains a cycle.',
      ),
    );
  }
}

function validateWorkflowSource(
  source: WorkflowSource,
  path: string,
  issues: WorkflowIssue[],
  workflowDepth = 0,
  total: { steps: number } = { steps: 0 },
): void {
  total.steps += source.steps.length;
  if (total.steps > MAX_TOTAL_STEPS) {
    issues.push(
      issue(
        'TOTAL_STEP_LIMIT_EXCEEDED',
        `${path}/steps`,
        `Nested workflows exceed ${MAX_TOTAL_STEPS} total steps.`,
      ),
    );
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(source.id)) {
    issues.push(
      issue('WORKFLOW_ID_INVALID', `${path}/id`, 'Workflow ID is invalid.'),
    );
  }
  if (
    !Number.isInteger(source.policy.maxConcurrentSteps) ||
    source.policy.maxConcurrentSteps < 1 ||
    source.policy.maxConcurrentSteps > 64
  ) {
    issues.push(
      issue(
        'POLICY_CONCURRENCY_INVALID',
        `${path}/policy/maxConcurrentSteps`,
        'Concurrency must be between 1 and 64.',
      ),
    );
  }
  if (
    !Number.isInteger(source.policy.maxAttempts) ||
    source.policy.maxAttempts < 1 ||
    source.policy.maxAttempts > 10
  ) {
    issues.push(
      issue(
        'POLICY_ATTEMPTS_INVALID',
        `${path}/policy/maxAttempts`,
        'Attempts must be between 1 and 10.',
      ),
    );
  }
  source.policy.allowedRoots.forEach((root, index) => {
    if (
      root.length === 0 ||
      root === '/' ||
      root.includes('\0') ||
      root.split(/[\\/]/).includes('..')
    ) {
      issues.push(
        issue(
          'UNSAFE_ALLOWED_ROOT',
          `${path}/policy/allowedRoots/${index}`,
          'Allowed root is unsafe.',
        ),
      );
    }
  });
  source.policy.allowedModels.forEach((model, index) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(model)) {
      issues.push(
        issue(
          'MODEL_ID_INVALID',
          `${path}/policy/allowedModels/${index}`,
          'Model ID is invalid.',
        ),
      );
    }
  });
  walkSchema(source.inputSchema, `${path}/inputSchema`, 0, issues);
  compileSchema(source.inputSchema, `${path}/inputSchema`, issues);
  if (source.outputSchema) {
    walkSchema(source.outputSchema, `${path}/outputSchema`, 0, issues);
    compileSchema(source.outputSchema, `${path}/outputSchema`, issues);
  }
  source.steps.forEach((step, index) =>
    validateStepDetails(
      step,
      source,
      index,
      issues,
      path,
      workflowDepth,
      total,
    ),
  );
  validateGraph(source, issues, path);
}

export function assertWorkflowSource(
  source: unknown,
): asserts source is WorkflowSource {
  if (!validateEnvelope(source)) {
    throw new WorkflowValidationError(envelopeIssues(validateEnvelope.errors));
  }
  const issues: WorkflowIssue[] = [];
  validateWorkflowSource(source as WorkflowSource, '', issues);
  if (issues.length > 0) throw new WorkflowValidationError(issues);
}

export function compileInputValidator(
  schema: JsonSchema,
): ValidateFunction<JsonValue> {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    validateFormats: false,
  });
  return ajv.compile<JsonValue>(schema);
}

export function inputIssues(
  errors: ErrorObject[] | null | undefined,
): WorkflowIssue[] {
  return (errors ?? []).map((error) =>
    issue(
      'INPUT_SCHEMA_INVALID',
      error.instancePath || '',
      error.message ?? 'Input is invalid.',
    ),
  );
}

export function topologicalSteps(source: WorkflowSource): WorkflowStep[] {
  const byId = new Map(source.steps.map((step) => [step.id, step]));
  const indegree = new Map(
    source.steps.map((step) => [step.id, step.dependsOn?.length ?? 0]),
  );
  const outgoing = new Map(
    source.steps.map((step) => [step.id, [] as string[]]),
  );
  for (const step of source.steps) {
    for (const dependency of step.dependsOn ?? [])
      outgoing.get(dependency)?.push(step.id);
  }
  const ready = [...indegree.entries()]
    .filter(([, value]) => value === 0)
    .map(([id]) => id)
    .sort();
  const ordered: WorkflowStep[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (!id) break;
    const step = byId.get(id);
    if (step) ordered.push(step);
    for (const next of (outgoing.get(id) ?? []).sort()) {
      const value = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, value);
      if (value === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }
  return ordered;
}
