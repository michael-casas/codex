import type { WikiStatusResult } from '../../../domain/entities/wiki-note.js';
import type { WikiIndexRepository } from '../../../domain/repositories/wiki-index.repository.js';
import type { WikiVaultRepository } from '../../../domain/repositories/wiki-vault.repository.js';
import type { StatusQuery } from './status.query.js';

export async function handleStatusQuery(
  _query: StatusQuery,
  dependencies: {
    vault: WikiVaultRepository;
    index: WikiIndexRepository;
  },
): Promise<WikiStatusResult> {
  const vaultExists = dependencies.vault.exists();
  const vaultPath = vaultExists
    ? dependencies.vault.canonicalPath()
    : dependencies.vault.vaultPath;
  const status = dependencies.index.inspect();
  const latestMtime = vaultExists
    ? await dependencies.vault.latestMarkdownMtimeMs()
    : null;
  const indexedAt = status.lastIndexedAt
    ? new Date(status.lastIndexedAt).getTime()
    : null;
  const fresh =
    vaultExists &&
    status.indexExists &&
    status.indexedVaultPath === vaultPath &&
    indexedAt !== null &&
    (latestMtime === null || latestMtime <= indexedAt);
  return {
    ok: true,
    vaultPath,
    vaultExists,
    indexPath: dependencies.index.indexPath,
    indexExists: status.indexExists,
    indexedVaultPath: status.indexedVaultPath,
    noteCount: status.noteCount,
    lastIndexedAt: status.lastIndexedAt,
    fresh,
  };
}
