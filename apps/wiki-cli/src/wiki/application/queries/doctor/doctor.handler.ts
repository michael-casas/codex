import type { WikiDoctorResult } from '../../../domain/entities/wiki-note.js';
import type { WikiIndexRepository } from '../../../domain/repositories/wiki-index.repository.js';
import type { WikiVaultRepository } from '../../../domain/repositories/wiki-vault.repository.js';
import type { DoctorQuery } from './doctor.query.js';

export function handleDoctorQuery(
  _query: DoctorQuery,
  dependencies: {
    vault: WikiVaultRepository;
    index: WikiIndexRepository;
  },
): WikiDoctorResult {
  const vaultExists = dependencies.vault.exists();
  const vaultPath = vaultExists
    ? dependencies.vault.canonicalPath()
    : dependencies.vault.vaultPath;
  const result = dependencies.index.doctor(vaultPath);
  if (vaultExists) return result;
  return {
    ...result,
    healthy: false,
    issues: [`Wiki vault does not exist: ${vaultPath}`, ...result.issues],
  };
}
