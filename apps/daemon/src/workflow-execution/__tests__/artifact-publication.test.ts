import { describe, it, expect } from 'vitest';
import {
  artifactFixture,
  artifactNames,
  artifactContent,
  artifactDigest,
} from '../support/artifact-publication.fixture.js';

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] artifact publication', () => {
  it('ARTIFACT-L1-NAMES keeps names and content distinct from storage classification', async () => {
    const f = artifactFixture();
    await f.run();
    const writes = f.commands.filter((c) => c.artifacts);
    expect(writes.map((c) => c.payload.name)).toEqual(artifactNames);
    expect(writes.map((c) => c.artifacts?.[0].kind)).toEqual(
      artifactNames.map(() => 'artifact'),
    );
    expect(new Set(writes.map((c) => c.payload.path)).size).toBe(
      artifactNames.length,
    );
    for (const c of writes) {
      expect(c.payload).toMatchObject({
        digest: artifactDigest,
        mediaType: 'text/markdown',
      });
      expect(Buffer.from(c.artifacts![0].content).toString()).toBe(
        artifactContent,
      );
    }
    expect(f.events.at(-1)?.kind).toBe('workflow.completed');
  });

  for (const [code, expected] of [
    ['23514', '23514'],
    ['42501', '42501'],
    ['private SQL token=secret', 'UNKNOWN'],
    ['TOKEN', 'UNKNOWN'],
  ]) {
    it(`ARTIFACT-L1-FAILURE classifies ${expected} without exposing publisher detail (${code.length})`, async () => {
      const f = artifactFixture({
        reject: Object.assign(Error('private SQL payload token=secret'), {
          code,
        }),
      });
      await f.run();
      expect(
        f.events.find((e) => e.kind === 'phase.failed')?.payload.phase,
      ).toBe('Preserve fixture evidence');
      expect(f.events.at(-1)?.payload).toEqual({
        runId: f.prepared.runId,
        diagnostic: 'artifact-failed',
        storageCode: expected,
      });
      expect(
        f.events.some((e) => e.kind === 'workflow.artifact.registered'),
      ).toBe(false);
      expect(JSON.stringify(f.events.map((e) => e.payload))).not.toMatch(
        /private|SQL|secret|TOKEN/,
      );
    });
  }
});
