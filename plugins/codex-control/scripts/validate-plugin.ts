import { readdir, readFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';

type JsonObject = Record<string, unknown>;

const allowedManifestFields = new Set([
  'name',
  'version',
  'description',
  'skills',
  'mcpServers',
  'interface',
  'author',
  'license',
  'keywords',
]);
const allowedInterfaceFields = new Set([
  'displayName',
  'shortDescription',
  'longDescription',
  'developerName',
  'category',
  'capabilities',
  'defaultPrompt',
]);
const identifier = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

async function jsonObject(path: string, label: string): Promise<JsonObject> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must contain a JSON object`);
  return value as JsonObject;
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${field} must be a non-empty string`);
  return value;
}

function rejectUnknownFields(
  value: JsonObject,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  for (const field of Object.keys(value))
    if (!allowed.has(field))
      throw new Error(`${label} field ${field} is not accepted`);
}

function contractPath(value: unknown, expected: string, field: string): void {
  const path = nonEmpty(value, field).replace(/\/$/, '');
  if (isAbsolute(path) || path.replace(/^\.\//, '') !== expected)
    throw new Error(`${field} must resolve to ${expected}`);
}

function rejectPlaceholders(value: unknown, path = '$'): void {
  if (typeof value === 'string' && value.includes('[TODO:'))
    throw new Error(`${path} still contains a TODO placeholder`);
  if (Array.isArray(value))
    value.forEach((item, index) =>
      rejectPlaceholders(item, `${path}[${index}]`),
    );
  else if (value && typeof value === 'object')
    Object.entries(value).forEach(([key, item]) =>
      rejectPlaceholders(item, `${path}.${key}`),
    );
}

async function validateSkills(root: string): Promise<void> {
  const skillsRoot = resolve(root, 'skills');
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  for (const entry of entries.filter(
    (candidate) => !candidate.name.startsWith('.') && candidate.isDirectory(),
  )) {
    const contents = await readFile(
      resolve(skillsRoot, entry.name, 'SKILL.md'),
      'utf8',
    ).catch(() => {
      throw new Error(`skill ${entry.name} is missing SKILL.md`);
    });
    const frontmatter = contents.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
    if (!frontmatter)
      throw new Error(`skill ${entry.name} must have YAML frontmatter`);
    const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const description = frontmatter
      .match(/^description:\s*(.+)$/m)?.[1]
      ?.trim();
    if (!name)
      throw new Error(`skill ${entry.name} frontmatter name must be non-empty`);
    if (!description)
      throw new Error(
        `skill ${entry.name} frontmatter description must be non-empty`,
      );
    const disabled = frontmatter
      .match(/^disable[-_]model[-_]invocation:\s*(.+)$/m)?.[1]
      ?.trim();
    if (disabled && disabled !== 'false')
      throw new Error(
        `skill ${entry.name} model invocation must remain enabled`,
      );
  }
}

export async function validatePlugin(root: string): Promise<void> {
  const manifest = await jsonObject(
    resolve(root, '.codex-plugin/plugin.json'),
    '.codex-plugin/plugin.json',
  );
  rejectPlaceholders(manifest);
  rejectUnknownFields(manifest, allowedManifestFields, 'plugin.json');

  const name = nonEmpty(manifest['name'], 'plugin.json name');
  if (!identifier.test(name) || name !== basename(root))
    throw new Error(
      'plugin.json name must be a valid identifier matching its directory',
    );
  if (!semver.test(nonEmpty(manifest['version'], 'plugin.json version')))
    throw new Error('plugin.json version must be strict semver');
  nonEmpty(manifest['description'], 'plugin.json description');
  nonEmpty(manifest['license'], 'plugin.json license');
  const keywords = manifest['keywords'];
  if (
    !Array.isArray(keywords) ||
    keywords.some((value) => typeof value !== 'string' || !value.trim())
  )
    throw new Error('plugin.json keywords must be an array of strings');

  const author = manifest['author'];
  if (!author || typeof author !== 'object' || Array.isArray(author))
    throw new Error('plugin.json author must be an object');
  rejectUnknownFields(
    author as JsonObject,
    new Set(['name']),
    'plugin.json author',
  );
  nonEmpty((author as JsonObject)['name'], 'plugin.json author.name');

  contractPath(manifest['skills'], 'skills', 'plugin.json skills');
  await validateSkills(root);
  contractPath(manifest['mcpServers'], '.mcp.json', 'plugin.json mcpServers');
  const mcp = await jsonObject(resolve(root, '.mcp.json'), '.mcp.json');
  if (Object.keys(mcp).some((key) => key !== 'mcpServers'))
    throw new Error('.mcp.json contains an unsupported field');
  const servers = mcp['mcpServers'];
  if (!servers || typeof servers !== 'object' || Array.isArray(servers))
    throw new Error('.mcp.json mcpServers must be an object');
  for (const [serverName, server] of Object.entries(servers)) {
    nonEmpty(serverName, '.mcp.json server name');
    if (!server || typeof server !== 'object' || Array.isArray(server))
      throw new Error(`.mcp.json server ${serverName} must be an object`);
  }

  const ui = manifest['interface'];
  if (!ui || typeof ui !== 'object' || Array.isArray(ui))
    throw new Error('plugin.json interface must be an object');
  rejectUnknownFields(
    ui as JsonObject,
    allowedInterfaceFields,
    'plugin.json interface',
  );
  for (const field of [
    'displayName',
    'shortDescription',
    'longDescription',
    'developerName',
    'category',
  ])
    nonEmpty((ui as JsonObject)[field], `plugin.json interface.${field}`);
  const capabilities = (ui as JsonObject)['capabilities'];
  if (
    !Array.isArray(capabilities) ||
    capabilities.some((value) => typeof value !== 'string' || !value.trim())
  )
    throw new Error(
      'plugin.json interface.capabilities must be an array of strings',
    );
  const prompt =
    (ui as JsonObject)['defaultPrompt'] ?? (ui as JsonObject)['default_prompt'];
  if (
    !(typeof prompt === 'string' && prompt.trim()) &&
    !(
      Array.isArray(prompt) &&
      prompt.every((value) => typeof value === 'string' && value.trim())
    )
  )
    throw new Error(
      'plugin.json interface.defaultPrompt must be text or an array of text',
    );
}

if (import.meta.main) {
  const root = process.argv[2];
  if (!root) throw new Error('usage: validate-plugin.ts <plugin-root>');
  validatePlugin(resolve(root))
    .then(() =>
      process.stdout.write(`Plugin validation passed: ${resolve(root)}\n`),
    )
    .catch((error: unknown) => {
      process.stderr.write(`Plugin validation failed: ${String(error)}\n`);
      process.exitCode = 1;
    });
}
