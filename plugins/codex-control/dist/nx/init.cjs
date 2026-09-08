"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugins/codex-control/src/generators/init/generator.ts
var generator_exports = {};
__export(generator_exports, {
  default: () => initGenerator
});
module.exports = __toCommonJS(generator_exports);
var MARKETPLACE = ".agents/plugins/marketplace.json";
var entry = {
  name: "codex-control",
  source: { source: "local", path: "./plugins/codex-control" },
  policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
  category: "Developer Tools"
};
function readMarketplace(tree) {
  if (!tree.exists(MARKETPLACE))
    return {
      name: "codex-control-local",
      interface: { displayName: "Codex Control Local" },
      plugins: []
    };
  const source = tree.read(MARKETPLACE, "utf8");
  if (source === null) throw new Error("CODEX_CONTROL_MARKETPLACE_INVALID");
  const parsed = JSON.parse(source);
  if (!parsed || typeof parsed !== "object" || typeof parsed.name !== "string" || !Array.isArray(parsed.plugins))
    throw new Error("CODEX_CONTROL_MARKETPLACE_INVALID");
  return parsed;
}
async function initGenerator(tree) {
  const marketplace = readMarketplace(tree);
  const index = marketplace.plugins.findIndex(
    (plugin) => plugin !== null && typeof plugin === "object" && plugin.name === entry.name
  );
  const plugins = [...marketplace.plugins];
  if (index === -1) plugins.push(entry);
  else plugins[index] = entry;
  const next = `${JSON.stringify({ ...marketplace, plugins }, null, 2)}
`;
  if (tree.read(MARKETPLACE, "utf8") !== next) tree.write(MARKETPLACE, next);
}
