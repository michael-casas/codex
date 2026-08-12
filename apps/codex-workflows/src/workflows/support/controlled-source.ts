import { readFileSync } from 'node:fs';

export type ControlledMode = 'success' | 'failure' | 'schema' | 'cancel';

export function controlledWorkflowSource(): string {
  return readFileSync(
    new URL('./controlled.workflow.fixture.txt', import.meta.url),
    'utf8',
  );
}

export function controlledInput(mode: ControlledMode): string {
  return `${JSON.stringify({ mode, topic: 'sensitive-input-topic' })}\n`;
}
