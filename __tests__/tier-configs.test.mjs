#!/usr/bin/env node
// ~/.codex/__tests__/tier-configs.test.mjs
// TDD tests for the 4 canonical tier configs in ~/.codex/.
//
// Run: node ~/.codex/__tests__/tier-configs.test.mjs
// Exit code: 0 on all-pass, 1 on any failure.
//
// Scope: validates the tier configs referenced in
// /Users/mcasa_atlantis/.django/_commands/fill-codex-tier-configs.md
//   - tier-0-dsv4.config.toml          (existing, verify)
//   - tier-1-mini.config.toml          (existing, verify)
//   - tier-3-gpt5-4.config.toml        (NEW, this task creates)
//   - tier-4-gpt5-5.config.toml        (NEW alias, this task creates)
//
// No external deps. Uses Node 20 built-ins (node:test, node:assert,
// node:fs, node:path). TOML parsed with regex — sufficient for the
// flat-scalar + single-table schema these configs use. Not a general
// TOML parser.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync, lstatSync, readlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODEX_DIR = resolve(__dirname, ".."); // ~/.codex/

// Minimal TOML surface — top-level scalars + one [section] header + one [section]
// nested table. Enough for the 4 canonical fields (model, model_reasoning_effort,
// approval_policy, sandbox_mode) and one section (sandbox_workspace_write) plus
// tui. Not a general parser; rejects mixed-type arrays, multi-line strings,
// inline tables, etc. with a clear error.
//
// Supports multi-line arrays: `writable_roots = [\n  "a",\n  "b",\n]`.
function parseToml(src) {
  const lines = src.split("\n");
  const root = {};
  const sections = {};
  let currentSection = null;
  let currentSectionObj = null;

  // Buffer for multi-line array values. When we see `key = [` we accumulate
  // subsequent lines until we see the closing `]`.
  let arrayBuffer = null; // { key, lines: string[] }

  for (let raw of lines) {
    // Strip end-of-line comments. Be careful: '#' inside a string is not a
    // comment, but we don't have inline strings long enough to need that.
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;

    if (arrayBuffer) {
      // Accumulate until the closing bracket.
      arrayBuffer.lines.push(line);
      if (line.includes("]")) {
        const joined = arrayBuffer.lines.join(" ");
        const innerStart = joined.indexOf("[") + 1;
        const innerEnd = joined.lastIndexOf("]");
        const inner = joined.slice(innerStart, innerEnd);
        const arr = inner
          .split(",")
          .map((x) => x.trim())
          .filter((x) => x.length > 0)
          .map((x) => {
            if (x.startsWith('"') && x.endsWith('"')) return x.slice(1, -1);
            if (/^-?\d[\d_]*$/.test(x)) return Number(x.replace(/_/g, ""));
            throw new Error(`unparseable array element: ${x}`);
          });
        if (currentSectionObj) {
          currentSectionObj[arrayBuffer.key] = arr;
        } else {
          root[arrayBuffer.key] = arr;
        }
        arrayBuffer = null;
      }
      continue;
    }

    if (line.startsWith("[")) {
      const m = line.match(/^\[([^\]]+)\]$/);
      if (!m) throw new Error(`unparseable section header: ${raw}`);
      currentSection = m[1];
      // nested table like [a.b]
      const parts = currentSection.split(".");
      let cursor = sections;
      for (let i = 0; i < parts.length; i++) {
        const k = parts[i];
        if (i === parts.length - 1) {
          if (!cursor[k]) cursor[k] = {};
          currentSectionObj = cursor[k];
        } else {
          if (!cursor[k]) cursor[k] = {};
          cursor = cursor[k];
        }
      }
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const valStr = line.slice(eq + 1).trim();
    // Multi-line array: starts with `[` and does not end with `]`.
    if (valStr.startsWith("[") && !valStr.endsWith("]")) {
      arrayBuffer = { key, lines: [valStr] };
      continue;
    }
    const value = parseValue(valStr);
    if (currentSectionObj) {
      currentSectionObj[key] = value;
    } else {
      root[key] = value;
    }
  }
  if (arrayBuffer) {
    throw new Error(`unterminated array for key: ${arrayBuffer.key}`);
  }
  return { root, sections };
}

function parseValue(v) {
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  if (v === "true") return true;
  if (v === "false") return false;
  // single-line array
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((x) => {
      x = x.trim();
      if (x.startsWith('"') && x.endsWith('"')) return x.slice(1, -1);
      if (/^-?\d[\d_]*$/.test(x)) return Number(x.replace(/_/g, ""));
      throw new Error(`unparseable array element: ${x}`);
    });
  }
  // number (with underscore separators like 1_000_000)
  if (/^-?\d[\d_]*$/.test(v)) return Number(v.replace(/_/g, ""));
  if (/^-?\d[\d_]*\.\d[\d_]*$/.test(v)) return Number(v.replace(/_/g, ""));
  throw new Error(`unparseable value: ${v}`);
}

function loadConfig(relPath) {
  const fullPath = resolve(CODEX_DIR, relPath);
  if (!existsSync(fullPath)) {
    throw new Error(`missing config: ${relPath}`);
  }
  const stat = statSync(fullPath);
  if (!stat.isFile() && !stat.isSymbolicLink()) {
    throw new Error(`not a regular file or symlink: ${relPath}`);
  }
  if (stat.size <= 0) {
    throw new Error(`config is empty (0 bytes): ${relPath}`);
  }
  // If symlink, read the target's contents (the symlink itself has 0 size in
  // stat on macOS when the target doesn't exist via lstat, but exists() + stat
  // follow the link. We read the symlink path directly, which follows the link.)
  const src = readFileSync(fullPath, "utf8");
  return { path: relPath, bytes: stat.size, src, parsed: parseToml(src) };
}

// --- Canonical schema (per tier-1-mini.config.toml:1-28) -------------------
// Required top-level scalars:
//   - model                              (L9)
//   - model_reasoning_effort             (L10)
//   - approval_policy                    (L12)
//   - sandbox_mode                       (L13)
// Required section:
//   - [sandbox_workspace_write]          (L16) with network_access (L17)
// Optional sections (validated as present-or-absent explicitly):
//   - [tui]                              (L26)

const REQUIRED_TOP_LEVEL = ["model", "model_reasoning_effort", "approval_policy", "sandbox_mode"];

function assertCanonicalSchema(parsed, ctx) {
  for (const k of REQUIRED_TOP_LEVEL) {
    assert.ok(
      k in parsed.root,
      `${ctx}: missing required top-level key "${k}"`,
    );
    assert.notStrictEqual(
      parsed.root[k],
      "",
      `${ctx}: required top-level key "${k}" is empty`,
    );
  }
  assert.ok(
    "sandbox_workspace_write" in parsed.sections,
    `${ctx}: missing required section [sandbox_workspace_write]`,
  );
  const sww = parsed.sections["sandbox_workspace_write"];
  assert.ok(
    "network_access" in sww,
    `${ctx}: [sandbox_workspace_write] missing network_access`,
  );
  assert.strictEqual(
    typeof sww.network_access,
    "boolean",
    `${ctx}: [sandbox_workspace_write].network_access must be boolean`,
  );
  assert.ok(
    "writable_roots" in sww,
    `${ctx}: [sandbox_workspace_write] missing writable_roots`,
  );
  assert.ok(
    Array.isArray(sww.writable_roots),
    `${ctx}: [sandbox_workspace_write].writable_roots must be an array`,
  );
}

// --- Tier-0: dsv4 (existing — verify) -------------------------------------
// Source: /Users/mcasa_atlantis/.codex/tier-0-dsv4.config.toml
// Schema: model_provider=opencode-go (L11), model=deepseek-v4-flash (L12),
//   reasoning_effort=low (L13), approval=never (L14), sandbox=workspace-write (L15),
//   [model_providers.opencode-go] block (L18-22), [sandbox_workspace_write] (L24-32,
//   network_access=false L25), service_tier=default (L16).
test("tier-0-dsv4: exists, parses, matches canonical schema", () => {
  const cfg = loadConfig("tier-0-dsv4.config.toml");
  assert.ok(cfg.bytes > 0, "tier-0-dsv4 must be non-empty");
  assertCanonicalSchema(cfg.parsed, "tier-0-dsv4");
  assert.strictEqual(cfg.parsed.root.model, "deepseek-v4-flash");
  assert.strictEqual(cfg.parsed.root.model_provider, "opencode-go");
  assert.strictEqual(cfg.parsed.sections.sandbox_workspace_write.network_access, false);
});

// --- Tier-1: mini (existing — verify) -------------------------------------
// Source: /Users/mcasa_atlantis/.codex/tier-1-mini.config.toml
// Schema: model=gpt-5.4-mini (L9), reasoning_effort=low (L10),
//   verbosity=low (L11), approval=never (L12), sandbox=workspace-write (L13),
//   [sandbox_workspace_write] (L16-24, network_access=false L17), [tui] (L26-28).
test("tier-1-mini: exists, parses, matches canonical schema", () => {
  const cfg = loadConfig("tier-1-mini.config.toml");
  assert.ok(cfg.bytes > 0, "tier-1-mini must be non-empty");
  assertCanonicalSchema(cfg.parsed, "tier-1-mini");
  assert.strictEqual(cfg.parsed.root.model, "gpt-5.4-mini");
  assert.strictEqual(cfg.parsed.root.model_reasoning_effort, "low");
  assert.strictEqual(cfg.parsed.sections.sandbox_workspace_write.network_access, false);
});

// --- Tier-3: gpt-5.4 (NEW — this task creates) -----------------------------
// Source: mirrors tier-1-mini.config.toml:1-28 shape per
//   /Users/mcasa_atlantis/.django/_commands/fill-codex-tier-configs.md:99
// Schema: model=gpt-5.4 (mirror t1 L9), reasoning_effort=low (mirror t1 L10),
//   approval=never (mirror t1 L12), sandbox=workspace-write (mirror t1 L13),
//   [sandbox_workspace_write] (mirror t1 L16-24).
test("tier-3-gpt5-4: exists, parses, matches canonical schema", () => {
  const cfg = loadConfig("tier-3-gpt5-4.config.toml");
  assert.ok(cfg.bytes > 0, "tier-3-gpt5-4 must be non-empty");
  assertCanonicalSchema(cfg.parsed, "tier-3-gpt5-4");
  assert.strictEqual(
    cfg.parsed.root.model,
    "gpt-5.4",
    'tier-3-gpt5-4 model must be "gpt-5.4" (per spec fill-codex-tier-configs.md:99)',
  );
});

// --- Tier-4: gpt-5.5 (NEW alias — this task creates) -----------------------
// Source: thin alias to convergence.config.toml per
//   /Users/mcasa_atlantis/.django/_commands/fill-codex-tier-configs.md:100
// Form: symlink to convergence.config.toml (the spec allows a 1-2 line
//   pointer, but a symlink resolves --profile tier-4-gpt5-5 to the
//   actual config; comment-only stubs do not work as codex profile targets).
test("tier-4-gpt5-5: exists as alias to convergence.config.toml", () => {
  const aliasPath = resolve(CODEX_DIR, "tier-4-gpt5-5.config.toml");
  assert.ok(
    existsSync(aliasPath),
    "tier-4-gpt5-5.config.toml must exist",
  );
  const lst = lstatSync(aliasPath);
  assert.ok(
    lst.isSymbolicLink(),
    "tier-4-gpt5-5.config.toml must be a symlink (the only alias form that works as a codex --profile target)",
  );
  const target = readlinkSync(aliasPath);
  assert.strictEqual(
    target,
    "convergence.config.toml",
    "tier-4-gpt5-5.config.toml must symlink to convergence.config.toml",
  );
  // The target must exist and be the canonical gpt-5.5 config.
  const targetFullPath = resolve(dirname(aliasPath), target);
  assert.ok(
    existsSync(targetFullPath),
    `alias target ${target} must exist`,
  );
  const targetSrc = readFileSync(targetFullPath, "utf8");
  const targetParsed = parseToml(targetSrc);
  assert.strictEqual(
    targetParsed.root.model,
    "gpt-5.5",
    "alias target (convergence.config.toml) must have model=gpt-5.5 — this is what t4 = hired gun maps to",
  );
  // The alias target uses sandbox_mode="danger-full-access" (the "hired
  // gun" mode) with a top-level writable_roots array — NOT the
  // [sandbox_workspace_write] block other tiers use. Validate it has
  // the convergence-specific shape.
  assert.strictEqual(
    targetParsed.root.sandbox_mode,
    "danger-full-access",
    "alias target must have sandbox_mode=danger-full-access (the convergence/hired-gun mode — per convergence.config.toml:21)",
  );
  assert.ok(
    "writable_roots" in targetParsed.root,
    "alias target must have top-level writable_roots (per convergence.config.toml:26-32)",
  );
  assert.ok(
    Array.isArray(targetParsed.root.writable_roots),
    "alias target writable_roots must be an array",
  );
  assert.ok(
    targetParsed.root.writable_roots.includes("/Users/mcasa_atlantis/.hermes"),
    "alias target writable_roots must include /Users/mcasa_atlantis/.hermes (per convergence.config.toml:28)",
  );
});

// --- Cross-tier sanity: model uniqueness ----------------------------------
// No two tier configs should claim the same model. Catches accidental
// duplicate writes.
test("tier configs have unique model values", () => {
  const paths = [
    "tier-0-dsv4.config.toml",
    "tier-1-mini.config.toml",
    "tier-3-gpt5-4.config.toml",
  ];
  const models = paths.map((p) => loadConfig(p).parsed.root.model);
  const unique = new Set(models);
  assert.strictEqual(
    unique.size,
    models.length,
    `tier configs must have distinct model values, got: ${JSON.stringify(models)}`,
  );
});
