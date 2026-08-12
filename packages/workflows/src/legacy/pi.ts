import {
  WorkflowValidationError,
  type LegacyPiImport,
  type LegacyPiTask,
  type WorkflowIssue,
} from '../lib/contracts.js';
import { sha256 } from '../normalization/canonical.js';

type UnknownRecord = Record<string, unknown>;

const MAX_LEGACY_BYTES = 8_388_608;
const MAX_LEGACY_RECORDS = 4_096;
const MAX_LEGACY_DEPTH = 64;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_DIAGNOSTIC_TEXT = 4_096;
const MAX_HISTORICAL_CLAIMS = 256;

interface ClaimSink {
  claims: LegacyPiImport['historicalClaims'];
  truncatedClaims: number;
}

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function fail(code: string, path: string, message: string): never {
  const issue: WorkflowIssue = { code, path, message };
  throw new WorkflowValidationError([issue]);
}

function jsonPrefix(source: string): { value: UnknownRecord; end: number } {
  const start = source.search(/\S/);
  if (start < 0 || source[start] !== '{') {
    fail(
      'LEGACY_JSON_INVALID',
      '',
      'Legacy source must begin with a JSON object.',
    );
  }
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = record(JSON.parse(source.slice(start, index + 1)));
          if (!parsed)
            fail('LEGACY_JSON_INVALID', '', 'Legacy JSON must be an object.');
          return { value: parsed, end: index + 1 };
        } catch (error) {
          if (error instanceof WorkflowValidationError) throw error;
          fail('LEGACY_JSON_INVALID', '', 'Legacy JSON prefix is malformed.');
        }
      }
    }
  }
  fail('LEGACY_JSON_INVALID', '', 'Legacy JSON prefix is incomplete.');
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function boundedString(
  value: unknown,
  path: string,
  maximum: number,
): string | undefined {
  const text = stringValue(value);
  if (text !== undefined && text.length > maximum) {
    fail(
      'LEGACY_TEXT_LIMIT_EXCEEDED',
      path,
      `Legacy text exceeds ${maximum} characters.`,
    );
  }
  return text;
}

function addClaim(sink: ClaimSink, kind: string, text: string): void {
  if (sink.claims.length >= MAX_HISTORICAL_CLAIMS) {
    sink.truncatedClaims += 1;
    return;
  }
  if (text.length > MAX_DIAGNOSTIC_TEXT) {
    sink.truncatedClaims += 1;
    sink.claims.push({
      kind,
      text: `${text.slice(0, MAX_DIAGNOSTIC_TEXT - 1)}…`,
    });
    return;
  }
  sink.claims.push({ kind, text });
}

function flattenTasks(
  values: unknown,
  tasks: LegacyPiTask[],
  claimSink: ClaimSink,
  timestamps: Set<string>,
  parentId?: string,
  depth = 0,
): void {
  if (!Array.isArray(values)) return;
  if (depth > MAX_LEGACY_DEPTH) {
    fail(
      'LEGACY_TASK_DEPTH_EXCEEDED',
      '/taskList/tasks',
      `Legacy task depth exceeds ${MAX_LEGACY_DEPTH}.`,
    );
  }
  for (const value of values) {
    const task = record(value);
    if (!task || typeof task.id !== 'string') continue;
    if (tasks.length >= MAX_LEGACY_RECORDS) {
      fail(
        'LEGACY_TASK_LIMIT_EXCEEDED',
        '/taskList/tasks',
        `Legacy task count exceeds ${MAX_LEGACY_RECORDS}.`,
      );
    }
    const id = boundedString(
      task.id,
      '/taskList/tasks/id',
      MAX_IDENTIFIER_LENGTH,
    );
    if (!id) continue;
    tasks.push({
      id,
      ...(parentId ? { parentId } : {}),
      ...(boundedString(task.status, '/taskList/tasks/status', 128)
        ? {
            status: boundedString(task.status, '/taskList/tasks/status', 128),
          }
        : {}),
      ...(boundedString(
        task.title,
        '/taskList/tasks/title',
        MAX_DIAGNOSTIC_TEXT,
      )
        ? {
            title: boundedString(
              task.title,
              '/taskList/tasks/title',
              MAX_DIAGNOSTIC_TEXT,
            ),
          }
        : {}),
    });
    for (const key of ['evidence', 'verificationContract']) {
      if (typeof task[key] === 'string')
        addClaim(claimSink, `task-${key}`, task[key]);
    }
    const completedAt = boundedString(
      task.completedAt,
      '/taskList/tasks/completedAt',
      128,
    );
    if (completedAt) timestamps.add(completedAt);
    flattenTasks(task.subtasks, tasks, claimSink, timestamps, id, depth + 1);
  }
}

function goalImport(
  goal: UnknownRecord,
  source: string,
  end: number,
  sourceDigest: `sha256:${string}`,
): LegacyPiImport {
  if (goal.version !== 3) {
    fail(
      'LEGACY_VERSION_UNSUPPORTED',
      '/version',
      'Only observed goal version 3 is supported.',
    );
  }
  const id = boundedString(goal.id, '/id', MAX_IDENTIFIER_LENGTH);
  if (!id) fail('LEGACY_GOAL_ID_INVALID', '/id', 'Goal ID is required.');
  const taskList = record(goal.taskList);
  const tasks: LegacyPiTask[] = [];
  const claimSink: ClaimSink = { claims: [], truncatedClaims: 0 };
  const timestamps = new Set<string>();
  for (const key of ['createdAt', 'updatedAt']) {
    const timestamp = boundedString(goal[key], `/${key}`, 128);
    if (timestamp) timestamps.add(timestamp);
  }
  flattenTasks(taskList?.tasks, tasks, claimSink, timestamps);
  if (taskList?.blockCompletion !== undefined) {
    addClaim(
      claimSink,
      'legacy-block-completion',
      String(taskList.blockCompletion),
    );
  }
  const prose = source.slice(end).trim();
  if (prose) addClaim(claimSink, 'legacy-completion-prose', prose);
  const objective = boundedString(
    goal.objective,
    '/objective',
    MAX_DIAGNOSTIC_TEXT,
  );
  return {
    schemaVersion: 1,
    sourceType: 'goal-v3',
    sourceDigest,
    legacyVersion: 3,
    goalIds: [id],
    eventIds: [],
    timestamps: [...timestamps].sort(),
    ...(objective ? { objective } : {}),
    tasks,
    policyRequest: {
      ...(typeof goal.autoContinue === 'boolean'
        ? { autoContinue: goal.autoContinue }
        : {}),
      ...(typeof taskList?.blockCompletion === 'boolean'
        ? { blockCompletion: taskList.blockCompletion }
        : {}),
    },
    historicalClaims: claimSink.claims,
    truncatedClaims: claimSink.truncatedClaims,
  };
}

function eventsImport(
  source: string,
  sourceDigest: `sha256:${string}`,
): LegacyPiImport {
  const lines = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0)
    fail('LEGACY_EVENTS_EMPTY', '', 'Event JSONL is empty.');
  if (lines.length > MAX_LEGACY_RECORDS) {
    fail(
      'LEGACY_EVENT_LIMIT_EXCEEDED',
      '',
      `Legacy event count exceeds ${MAX_LEGACY_RECORDS}.`,
    );
  }
  const goalIds = new Set<string>();
  const timestamps = new Set<string>();
  const eventIds: string[] = [];
  const tasks = new Map<string, LegacyPiTask>();
  const claimSink: ClaimSink = { claims: [], truncatedClaims: 0 };
  let objective: string | undefined;
  let autoContinue: boolean | undefined;
  let blockCompletion: boolean | undefined;
  lines.forEach((line, index) => {
    let event: UnknownRecord | undefined;
    try {
      event = record(JSON.parse(line));
    } catch {
      fail(
        'LEGACY_EVENT_INVALID',
        `/${index}`,
        'Event JSONL line is malformed.',
      );
    }
    if (!event || typeof event.type !== 'string') {
      fail('LEGACY_EVENT_INVALID', `/${index}`, 'Event type is required.');
    }
    const goalId = boundedString(
      event.goalId,
      `/${index}/goalId`,
      MAX_IDENTIFIER_LENGTH,
    );
    if (goalId) goalIds.add(goalId);
    const timestamp = boundedString(event.at, `/${index}/at`, 128);
    if (timestamp) timestamps.add(timestamp);
    eventIds.push(
      boundedString(event.id, `/${index}/id`, MAX_IDENTIFIER_LENGTH) ??
        `event:${index}:${String(event.type).slice(0, 128)}`,
    );
    const eventObjective = boundedString(
      event.objective,
      `/${index}/objective`,
      MAX_DIAGNOSTIC_TEXT,
    );
    if (eventObjective) objective = eventObjective;
    if (typeof event.autoContinue === 'boolean')
      autoContinue = event.autoContinue;
    if (typeof event.blockCompletion === 'boolean')
      blockCompletion = event.blockCompletion;
    const taskId = boundedString(
      event.taskId,
      `/${index}/taskId`,
      MAX_IDENTIFIER_LENGTH,
    );
    if (taskId && !tasks.has(taskId)) {
      tasks.set(taskId, { id: taskId });
    }
    for (const key of ['evidence', 'summary', 'report', 'verdict']) {
      if (typeof event[key] === 'string') {
        addClaim(claimSink, `event-${key}`, event[key]);
      }
    }
  });
  return {
    schemaVersion: 1,
    sourceType: 'goal-events-jsonl',
    sourceDigest,
    goalIds: [...goalIds].sort(),
    eventIds,
    timestamps: [...timestamps].sort(),
    ...(objective ? { objective } : {}),
    tasks: [...tasks.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    policyRequest: {
      ...(autoContinue === undefined ? {} : { autoContinue }),
      ...(blockCompletion === undefined ? {} : { blockCompletion }),
    },
    historicalClaims: claimSink.claims,
    truncatedClaims: claimSink.truncatedClaims,
  };
}

export function parseLegacyPi(bytes: Uint8Array): LegacyPiImport {
  if (bytes.byteLength > MAX_LEGACY_BYTES) {
    fail(
      'LEGACY_SOURCE_LIMIT_EXCEEDED',
      '',
      `Legacy source exceeds ${MAX_LEGACY_BYTES} bytes.`,
    );
  }
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('LEGACY_UTF8_INVALID', '', 'Legacy source must be UTF-8.');
  }
  const sourceDigest = sha256(bytes);
  const prefix = jsonPrefix(source);
  return Object.hasOwn(prefix.value, 'version')
    ? goalImport(prefix.value, source, prefix.end, sourceDigest)
    : eventsImport(source, sourceDigest);
}
