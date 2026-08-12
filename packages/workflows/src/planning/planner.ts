import {
  WorkflowValidationError,
  type JsonValue,
  type NormalizedWorkflow,
  type PlannedNode,
  type WorkflowCondition,
  type WorkflowHandler,
  type WorkflowIssue,
  type WorkflowPlan,
  type WorkflowPolicy,
  type WorkflowStep,
} from '../lib/contracts.js';
import {
  canonicalizeJson,
  deepFreeze,
  sha256,
} from '../normalization/canonical.js';
import { compileInputValidator, inputIssues } from '../schema/validation.js';

const MAX_PLAN_NODES = 4_096;

function clonePolicy(policy: WorkflowPolicy): WorkflowPolicy {
  return JSON.parse(JSON.stringify(policy)) as WorkflowPolicy;
}

function capabilityRequest(
  step: WorkflowStep,
  workflow: NormalizedWorkflow,
): string[] {
  if (step.kind === 'task' || step.kind === 'fan-out') {
    return [
      step.handler.type === 'registered'
        ? `handler:${step.handler.name}`
        : `codex:${step.handler.model ?? workflow.definition.policy.allowedModels[0]}`,
    ];
  }
  if (step.kind === 'subworkflow') return ['subworkflow'];
  if (step.kind === 'artifact') return [`artifact:${step.mediaType}`];
  return [];
}

function handlerRequest(
  handler: WorkflowHandler,
  workflow: NormalizedWorkflow,
): PlannedNode['handlerRequest'] {
  return handler.type === 'registered'
    ? { type: 'registered', name: handler.name }
    : {
        type: 'codex',
        model:
          handler.model ?? workflow.definition.policy.allowedModels[0] ?? '',
        promptDigest: sha256(handler.prompt),
      };
}

function nodeRequest(
  step: WorkflowStep,
  workflow: NormalizedWorkflow,
): Pick<PlannedNode, 'capabilityRequest' | 'policyRequest' | 'handlerRequest'> {
  return {
    capabilityRequest: capabilityRequest(step, workflow),
    policyRequest: clonePolicy(workflow.definition.policy),
    ...(step.kind === 'task' || step.kind === 'fan-out'
      ? { handlerRequest: handlerRequest(step.handler, workflow) }
      : {}),
  };
}

function pointer(value: unknown, source: string): unknown {
  let current = value;
  for (const rawSegment of source.slice(1).split('/')) {
    const segment = rawSegment.replaceAll('~1', '/').replaceAll('~0', '~');
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function conditionMatches(
  condition: WorkflowCondition | undefined,
  input: unknown,
): boolean {
  if (!condition) return true;
  const actual = pointer(input, condition.pointer);
  if (condition.operator === 'exists') return actual !== undefined;
  const expected = canonicalizeJson(condition.value ?? null);
  const actualCanonical =
    actual === undefined ? undefined : canonicalizeJson(actual as JsonValue);
  return condition.operator === 'equals'
    ? actualCanonical === expected
    : actualCanonical !== expected;
}

function fail(code: string, path: string, message: string): never {
  const issue: WorkflowIssue = { code, path, message };
  throw new WorkflowValidationError([issue]);
}

export function validateWorkflowInput(
  workflow: NormalizedWorkflow,
  input: unknown,
): asserts input is JsonValue {
  const validate = compileInputValidator(workflow.definition.inputSchema);
  if (!validate(input))
    throw new WorkflowValidationError(inputIssues(validate.errors));
}

export function planWorkflow(
  workflow: NormalizedWorkflow,
  input: unknown,
): WorkflowPlan {
  validateWorkflowInput(workflow, input);
  const nodes: PlannedNode[] = [];
  const nodeIdsByStep = new Map<string, string[]>();
  const warnings: string[] = [];
  const appendNode = (node: PlannedNode): void => {
    if (nodes.length >= MAX_PLAN_NODES) {
      fail(
        'PLAN_NODE_LIMIT_EXCEEDED',
        '/steps',
        `Plan expansion exceeds ${MAX_PLAN_NODES} nodes.`,
      );
    }
    nodes.push(node);
  };

  for (const step of workflow.definition.steps) {
    const dependencies = (step.dependsOn ?? []).flatMap(
      (dependency) => nodeIdsByStep.get(dependency) ?? [dependency],
    );
    const matches = conditionMatches(step.condition, input);
    if (!matches) {
      const node: PlannedNode = {
        id: step.id,
        stepId: step.id,
        kind: step.kind,
        dependsOn: dependencies,
        status: 'skipped',
        ...nodeRequest(step, workflow),
      };
      appendNode(node);
      nodeIdsByStep.set(step.id, [node.id]);
      continue;
    }

    if (step.kind === 'fan-out') {
      const collection = pointer(input, step.from);
      if (!Array.isArray(collection)) {
        fail(
          'FAN_OUT_SOURCE_INVALID',
          step.from,
          'Fan-out source must resolve to an array.',
        );
      }
      if (collection.length > step.maxItems) {
        fail(
          'FAN_OUT_LIMIT_EXCEEDED',
          step.from,
          'Fan-out source exceeds maxItems.',
        );
      }
      const items = collection.map((item, index) => {
        const value = pointer(item, step.itemKey);
        if (typeof value !== 'string' && typeof value !== 'number') {
          fail(
            'FAN_OUT_KEY_INVALID',
            `${step.from}/${index}`,
            'Fan-out item key must resolve to a string or number.',
          );
        }
        return { key: String(value), index };
      });
      const keys = new Set<string>();
      for (const item of items) {
        if (keys.has(item.key)) {
          fail(
            'DUPLICATE_FAN_OUT_KEY',
            step.itemKey,
            'Fan-out item keys must be unique.',
          );
        }
        keys.add(item.key);
      }
      items.sort((left, right) =>
        left.key === right.key
          ? left.index - right.index
          : left.key.localeCompare(right.key),
      );
      if (items.length === 0) {
        appendNode({
          id: step.id,
          stepId: step.id,
          kind: step.kind,
          dependsOn: dependencies,
          status: 'skipped',
          ...nodeRequest(step, workflow),
        });
        nodeIdsByStep.set(step.id, [step.id]);
        warnings.push(`Fan-out step ${step.id} has no items.`);
      } else {
        const ids = items.map(({ key }) => {
          const id = `${step.id}[${key}]`;
          appendNode({
            id,
            stepId: step.id,
            kind: step.kind,
            dependsOn: dependencies,
            status: 'ready',
            itemKey: key,
            ...nodeRequest(step, workflow),
          });
          return id;
        });
        nodeIdsByStep.set(step.id, ids);
      }
      continue;
    }

    const node: PlannedNode = {
      id: step.id,
      stepId: step.id,
      kind: step.kind,
      dependsOn: dependencies,
      status: 'ready',
      ...nodeRequest(step, workflow),
    };
    if (step.kind === 'subworkflow')
      node.childDigest = workflow.childDigests[step.id];
    if (step.kind === 'artifact') {
      node.artifact = {
        sourceStep: step.sourceStep,
        mediaType: step.mediaType,
        redaction: step.redaction,
        retention: step.retention,
      };
    }
    appendNode(node);
    nodeIdsByStep.set(step.id, [node.id]);
  }

  return deepFreeze({
    schemaVersion: 1,
    workflowId: workflow.definition.id,
    workflowVersion: workflow.definition.version,
    definitionDigest: workflow.digest,
    inputDigest: sha256(canonicalizeJson(input)),
    policy: clonePolicy(workflow.definition.policy),
    nodes,
    warnings,
    requiredCapabilities: [...workflow.requiredCapabilities],
  });
}
