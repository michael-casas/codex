import type { Tree } from '@nx/devkit';

const MARKETPLACE = '.agents/plugins/marketplace.json';
const entry = {
  name: 'codex-control',
  source: { source: 'local', path: './plugins/codex-control' },
  policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
  category: 'Developer Tools',
} as const;

interface Marketplace {
  name: string;
  interface?: { displayName?: string };
  plugins: unknown[];
}

function readMarketplace(tree: Tree): Marketplace {
  if (!tree.exists(MARKETPLACE))
    return {
      name: 'codex-control-local',
      interface: { displayName: 'Codex Control Local' },
      plugins: [],
    };
  const source = tree.read(MARKETPLACE, 'utf8');
  if (source === null) throw new Error('CODEX_CONTROL_MARKETPLACE_INVALID');
  const parsed: unknown = JSON.parse(source);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as Marketplace).name !== 'string' ||
    !Array.isArray((parsed as Marketplace).plugins)
  )
    throw new Error('CODEX_CONTROL_MARKETPLACE_INVALID');
  return parsed as Marketplace;
}

export default async function initGenerator(tree: Tree): Promise<void> {
  const marketplace = readMarketplace(tree);
  const index = marketplace.plugins.findIndex(
    (plugin) =>
      plugin !== null &&
      typeof plugin === 'object' &&
      (plugin as { name?: unknown }).name === entry.name,
  );
  const plugins = [...marketplace.plugins];
  if (index === -1) plugins.push(entry);
  else plugins[index] = entry;
  const next = `${JSON.stringify({ ...marketplace, plugins }, null, 2)}\n`;
  if (tree.read(MARKETPLACE, 'utf8') !== next) tree.write(MARKETPLACE, next);
}
