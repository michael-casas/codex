/** Model-authored URLs are external links, never executable or control-plane paths. */
export function safeMarkdownUrl(
  value: string,
  attribute: string,
): string | null {
  if (
    attribute !== 'href' ||
    typeof value !== 'string' ||
    !/^https?:\/\//i.test(value) ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) <= 32 ||
        character.charCodeAt(0) === 127 ||
        character === '\\',
    )
  )
    return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      !url.hostname ||
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      return null;
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
