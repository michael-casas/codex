export type WikiErrorCode =
  | 'USAGE_ERROR'
  | 'VAULT_NOT_FOUND'
  | 'INDEX_NOT_FOUND'
  | 'INDEX_VAULT_MISMATCH'
  | 'INDEX_SCHEMA_UNSUPPORTED'
  | 'NOTE_NOT_FOUND'
  | 'NOTE_AMBIGUOUS'
  | 'INDEX_ERROR'
  | 'NOT_IMPLEMENTED';

export class WikiError extends Error {
  constructor(
    readonly code: WikiErrorCode,
    message: string,
    readonly candidates: string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'WikiError';
  }
}
