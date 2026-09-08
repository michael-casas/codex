import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { WorkflowExecutionError } from '@codex/workflows';

export async function resolveAgentWorkingDirectory(
  workspace: string,
  selected?: string,
): Promise<string> {
  const admittedWorkspace = await realpath(resolve(workspace));
  if (!selected) return admittedWorkspace;

  let admittedSelection: string;
  try {
    admittedSelection = await realpath(resolve(selected));
  } catch {
    throw new WorkflowExecutionError(
      'WORKFLOW_DEFINITION_INVALID',
      'The selected agent working directory does not exist.',
    );
  }
  const path = relative(admittedWorkspace, admittedSelection);
  if (
    !isAbsolute(admittedSelection) ||
    path === '' ||
    path === '..' ||
    path.startsWith(`..${sep}`) ||
    isAbsolute(path)
  ) {
    throw new WorkflowExecutionError(
      'WORKFLOW_DEFINITION_INVALID',
      'The selected agent working directory must be a workspace-owned child directory.',
    );
  }
  return admittedSelection;
}
