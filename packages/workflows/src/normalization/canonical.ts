import { createHash } from 'node:crypto';

import type { JsonValue } from '../lib/contracts.js';

export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizeValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeValue(value[key] as JsonValue)]),
  );
}

export function canonicalizeJson(value: JsonValue): string {
  return JSON.stringify(normalizeValue(value));
}

export function sha256(value: string | Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
