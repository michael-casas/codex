import type { ControlClient, ControlToolName, VisibilityResult } from './types';

function query(args: Record<string, unknown>): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined) parameters.set(key, String(value));
  }
  const encoded = parameters.toString();
  return encoded ? `?${encoded}` : '';
}

export function createBrowserControlClient(origin: string): ControlClient {
  const base = new URL(origin);
  return Object.freeze({
    async callTool(
      name: ControlToolName,
      args: Record<string, unknown>,
      options?: { readonly signal?: AbortSignal },
    ): Promise<VisibilityResult> {
      const operation = name === 'get_control_snapshot' ? 'snapshot' : 'wait';
      const response = await fetch(
        new URL(`/api/control/${operation}${query(args)}`, base),
        { signal: options?.signal },
      );
      const value = (await response.json()) as VisibilityResult & {
        code?: string;
      };
      if (!response.ok)
        throw new Error(value.code ?? 'Control gateway unavailable');
      return value;
    },
  });
}
