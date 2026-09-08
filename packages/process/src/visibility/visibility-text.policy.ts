/** Shared display redaction; this is not a general-purpose secret detector. */
export function redactVisibilityText(value: string): string {
  return value
    .replace(/\b(bearer)\s+[^\s]+/gi, '$1 [redacted]')
    .replace(
      /\b(token|password|secret|credential|api[_-]?key)\s*[:=]\s*[^\s]+/gi,
      '$1=[redacted]',
    )
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/gi, '[credential]@')
    .replace(/\/(?:Users|home|private|tmp|var)\/[^\s"'`]+/g, '[path]');
}
