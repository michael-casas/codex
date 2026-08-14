import type { WikiReindexResult } from '../../../domain/entities/wiki-note.js';
import type { WikiIndexRepository } from '../../../domain/repositories/wiki-index.repository.js';
import type { WikiVaultRepository } from '../../../domain/repositories/wiki-vault.repository.js';
import type { ReindexCommand } from './reindex.command.js';

export async function handleReindexCommand(
  command: ReindexCommand,
  dependencies: {
    vault: WikiVaultRepository;
    index: WikiIndexRepository;
  },
): Promise<WikiReindexResult> {
  const vaultPath = dependencies.vault.canonicalPath();
  const notes = await dependencies.vault.readAllNotes();
  const result = dependencies.index.replaceProjection({
    notes,
    vaultPath,
    full: command.full,
  });
  return { ...result, vaultPath: dependencies.vault.vaultPath };
}
