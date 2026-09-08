#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const canonicalKeys = [
  'HERDR_ENV',
  'HERDR_SOCKET_PATH',
  'HERDR_WORKSPACE_ID',
  'HERDR_TAB_ID',
  'HERDR_PANE_ID',
];

export function resolveHerdrThreadContext(input) {
  const { threadId, sessions, socketExists } = input;
  if (!threadId || !Array.isArray(sessions)) return null;

  const matches = [];
  for (const session of sessions) {
    if (!session || typeof session.socketPath !== 'string') continue;
    if (!socketExists(session.socketPath)) continue;
    const workspaces = session.document?.workspaces;
    if (!Array.isArray(workspaces)) continue;

    for (const workspace of workspaces) {
      if (!workspace || typeof workspace.id !== 'string') continue;
      const tabs = workspace.tabs;
      const publicTabs = workspace.public_tab_numbers;
      const publicPanes = workspace.public_pane_numbers;
      if (
        !Array.isArray(tabs) ||
        !Array.isArray(publicTabs) ||
        !publicPanes ||
        typeof publicPanes !== 'object'
      ) {
        continue;
      }

      tabs.forEach((tab, tabIndex) => {
        const publicTabNumber = publicTabs[tabIndex];
        if (!Number.isInteger(publicTabNumber)) return;
        const panes = tab?.panes;
        if (!panes || typeof panes !== 'object') return;

        for (const [privatePaneId, pane] of Object.entries(panes)) {
          const sessionIdentity = pane?.agent_session;
          if (
            sessionIdentity?.source !== 'herdr:codex' ||
            sessionIdentity?.agent !== 'codex' ||
            sessionIdentity?.kind !== 'id' ||
            sessionIdentity?.value !== threadId
          ) {
            continue;
          }
          const publicPaneNumber = publicPanes[privatePaneId];
          if (!Number.isInteger(publicPaneNumber)) continue;
          matches.push({
            socketPath: session.socketPath,
            workspaceId: workspace.id,
            tabId: `${workspace.id}:t${publicTabNumber}`,
            paneId: `${workspace.id}:p${publicPaneNumber}`,
          });
        }
      });
    }
  }

  return matches.length === 1 ? matches[0] : null;
}

export function renderShellContext(context) {
  if (!context) {
    return [
      ...canonicalKeys.map((key) => `unset ${key}`),
      'export CODEX_HERDR_CONTEXT_SOURCE=unmapped',
    ].join('\n');
  }
  return [
    'export HERDR_ENV=1',
    `export HERDR_SOCKET_PATH=${shellQuote(context.socketPath)}`,
    `export HERDR_WORKSPACE_ID=${shellQuote(context.workspaceId)}`,
    `export HERDR_TAB_ID=${shellQuote(context.tabId)}`,
    `export HERDR_PANE_ID=${shellQuote(context.paneId)}`,
    'export CODEX_HERDR_CONTEXT_SOURCE=thread-session-map',
  ].join('\n');
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

async function main() {
  const threadId = process.env.CODEX_THREAD_ID ?? process.env.CODEX_SESSION_ID;
  if (!threadId) return;
  const home = process.env.HOME;
  if (!home) {
    process.stdout.write(renderShellContext(null));
    return;
  }
  const configRoot =
    process.env.HERDR_CONFIG_DIR ?? join(home, '.config', 'herdr');
  const sessions = loadSessions(configRoot);
  const context = resolveHerdrThreadContext({
    threadId,
    sessions,
    socketExists: isLiveSocket,
  });
  process.stdout.write(renderShellContext(context));
}

function loadSessions(configRoot) {
  const candidates = [
    {
      documentPath: join(configRoot, 'session.json'),
      socketPath: join(configRoot, 'herdr.sock'),
    },
  ];
  const namedRoot = join(configRoot, 'sessions');
  if (existsSync(namedRoot)) {
    for (const entry of readdirSync(namedRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      candidates.push({
        documentPath: join(namedRoot, entry.name, 'session.json'),
        socketPath: join(namedRoot, entry.name, 'herdr.sock'),
      });
    }
  }

  const sessions = [];
  for (const candidate of candidates) {
    try {
      sessions.push({
        socketPath: candidate.socketPath,
        document: JSON.parse(readFileSync(candidate.documentPath, 'utf8')),
      });
    } catch {
      // Session files are runtime snapshots. A partial or stale snapshot is not
      // authority to guess a pane; ignore it and require one valid match.
    }
  }
  return sessions;
}

function isLiveSocket(path) {
  try {
    return statSync(path).isSocket();
  } catch {
    return false;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
