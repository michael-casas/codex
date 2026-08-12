import {
  type JsonValue,
  type NormalizedWorkflow,
  type WorkflowHandler,
  type WorkflowSource,
} from '../lib/contracts.js';
import {
  assertWorkflowSource,
  topologicalSteps,
} from '../schema/validation.js';
import { canonicalizeJson, deepFreeze, sha256 } from './canonical.js';

function cloned<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function capability(handler: WorkflowHandler, source: WorkflowSource): string {
  return handler.type === 'registered'
    ? `handler:${handler.name}`
    : `codex:${handler.model ?? source.policy.allowedModels[0]}`;
}

export function normalizeWorkflow(source: unknown): NormalizedWorkflow {
  assertWorkflowSource(source);
  const definition = cloned(source);
  const childDigests: Record<string, `sha256:${string}`> = {};
  const requiredCapabilities = new Set<string>();
  definition.steps = topologicalSteps(definition).map((step) => {
    const normalized = cloned(step);
    normalized.dependsOn = [...(normalized.dependsOn ?? [])].sort();
    if (normalized.kind === 'task' || normalized.kind === 'fan-out') {
      requiredCapabilities.add(capability(normalized.handler, definition));
    } else if (normalized.kind === 'artifact') {
      requiredCapabilities.add(`artifact:${normalized.mediaType}`);
    } else if (normalized.kind === 'subworkflow') {
      const child = normalizeWorkflow(normalized.workflow);
      normalized.workflow = child.definition;
      childDigests[normalized.id] = child.digest;
      requiredCapabilities.add('subworkflow');
      child.requiredCapabilities.forEach((item) =>
        requiredCapabilities.add(item),
      );
    }
    return normalized;
  });
  const canonicalJson = canonicalizeJson(definition as unknown as JsonValue);
  return deepFreeze({
    definition,
    canonicalJson,
    digest: sha256(canonicalJson),
    dependencyEdges: definition.steps.reduce(
      (count, step) => count + (step.dependsOn?.length ?? 0),
      0,
    ),
    requiredCapabilities: [...requiredCapabilities].sort(),
    childDigests,
  });
}
