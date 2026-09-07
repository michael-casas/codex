export type PresentationKind = 'workflow' | 'agent';

export interface PresentationDescriptor {
  readonly id: string;
  readonly kind: PresentationKind;
  readonly localPath: string;
  readonly mcpAppsResourceUri: 'ui://codex-control/v1.html';
  readonly mobile:
    | { readonly state: 'not-configured' }
    | {
        readonly state: 'available';
        readonly url: string;
        readonly access: 'tailnet' | 'cloudflare-access';
        readonly readOnly: true;
      };
}

export interface PresentationOptions {
  readonly mobileBaseUrl?: string;
  readonly mobileAccess?: 'tailnet' | 'cloudflare-access';
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

export class PresentationError extends Error {
  override readonly name = 'PresentationError';

  constructor(readonly code: string) {
    super(code);
  }
}

function validatedId(id: string): string {
  if (!ID.test(id)) throw new PresentationError('PRESENTATION_ID_INVALID');
  return id;
}

function mobileUrl(
  kind: PresentationKind,
  id: string,
  options: PresentationOptions,
): PresentationDescriptor['mobile'] {
  if (!options.mobileBaseUrl) return { state: 'not-configured' };
  let url: URL;
  try {
    url = new URL(options.mobileBaseUrl);
  } catch {
    throw new PresentationError('PRESENTATION_MOBILE_URL_INVALID');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new PresentationError('PRESENTATION_MOBILE_URL_INVALID');
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${kind}s/${id}`;
  return {
    state: 'available',
    url: url.toString(),
    access: options.mobileAccess ?? 'tailnet',
    readOnly: true,
  };
}

export function createPresentationDescriptor(
  kind: PresentationKind,
  candidateId: string,
  options: PresentationOptions = {},
): PresentationDescriptor {
  const id = validatedId(candidateId);
  return Object.freeze({
    id,
    kind,
    localPath: `/${kind}s/${id}`,
    mcpAppsResourceUri: 'ui://codex-control/v1.html',
    mobile: mobileUrl(kind, id, options),
  });
}

export function parseControlRoute(
  pathname: string,
): { readonly kind: PresentationKind; readonly id: string } | undefined {
  const match = /^\/(workflows|agents)\/([^/]+)\/?$/.exec(pathname);
  if (!match) return undefined;
  return {
    kind: match[1] === 'workflows' ? 'workflow' : 'agent',
    id: validatedId(decodeURIComponent(match[2] ?? '')),
  };
}
