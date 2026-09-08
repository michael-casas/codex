// MARK:REFACTOR CAS-FS-06: explicit facade exports and domain CQRS classification during polish; see docs/plans/codex-control-structural-polish.md.
export * from './lib/contracts.js';
export * from './normalization/canonical.js';
export * from './normalization/normalize.js';
export * from './planning/planner.js';
export * from './legacy/pi.js';
export * from './authoring/types.js';
export * from './authoring/api.js';
export * from './authoring/execution.js';
export * from './control/run-workflow.js';
export {
  createWorkflowSourceSubmission,
  WorkflowSourceAdmissionError,
} from './application/commands/submit-workflow-source/submit-workflow-source.handler.js';
export type {
  WorkflowSourceCommand,
  WorkflowSourceContext,
  WorkflowSourceIdentity,
  WorkflowSourceSubmissionDependencies,
} from './application/commands/submit-workflow-source/submit-workflow-source.command.js';
