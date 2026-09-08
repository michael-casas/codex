import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const PHASES = [
  'armed',
  'waiting',
  'condition_met',
  'request_accepted',
  'turn_terminal_observed',
  'persisted_reconciled',
] as const;

export type MonitorPhase = (typeof PHASES)[number];

export interface MonitorEvent extends Record<string, unknown> {
  phase: MonitorPhase;
  at: string;
}

export interface MonitorSnapshot extends Record<string, unknown> {
  wake_id: string;
  marker: string;
  phase: MonitorPhase;
  events: MonitorEvent[];
}

function timestamp(): string {
  return new Date().toISOString().replace('Z', '+00:00');
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, sorted(object[key])]),
    );
  }
  return value;
}

export class MonitorState {
  readonly path: string;
  snapshot: MonitorSnapshot;

  constructor(path: string, wakeId: string, marker: string) {
    this.path = path;
    if (existsSync(path)) {
      this.snapshot = JSON.parse(readFileSync(path, 'utf8')) as MonitorSnapshot;
    } else {
      this.snapshot = {
        wake_id: wakeId,
        marker,
        phase: 'armed',
        events: [],
      };
      this.write();
    }
  }

  transition(phase: MonitorPhase, details: Record<string, unknown> = {}): void {
    if (!PHASES.includes(phase)) throw new Error(`unknown phase: ${phase}`);
    const current = this.snapshot.phase;
    if (PHASES.indexOf(phase) !== PHASES.indexOf(current) + 1) {
      throw new Error(`invalid transition: ${current} -> ${phase}`);
    }
    this.snapshot.phase = phase;
    Object.assign(this.snapshot, details);
    this.snapshot.events.push({ phase, at: timestamp(), ...details });
    this.write();
  }

  markPersistedWithoutSubmit(turnId: string): void {
    if (this.snapshot.phase !== 'condition_met') {
      throw new Error(
        'read-before-retry reconciliation requires condition_met',
      );
    }
    this.snapshot.phase = 'persisted_reconciled';
    this.snapshot.turn_id = turnId;
    this.snapshot.submission_suppressed = true;
    this.snapshot.events.push({
      phase: 'persisted_reconciled',
      at: timestamp(),
      turn_id: turnId,
      submission_suppressed: true,
    });
    this.write();
  }

  shouldSubmit(): boolean {
    return this.snapshot.phase === 'condition_met';
  }

  annotate(details: Record<string, unknown>): void {
    Object.assign(this.snapshot, details);
    this.write();
  }

  private write(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = join(
      dirname(this.path),
      `.${basename(this.path)}.${process.pid}.tmp`,
    );
    writeFileSync(
      temporary,
      `${JSON.stringify(sorted(this.snapshot), null, 2)}\n`,
    );
    renameSync(temporary, this.path);
  }
}
