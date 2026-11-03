#!/usr/bin/env node
// Checks the agent plugin in plugins/dial: the root marketplace entry points at
// it, both manifests parse and agree, every path a manifest names exists, every
// skill and command has its frontmatter, and the skills and commands only name
// tools of the remote MCP server (getdial.ai/mcp) listed in TOOLS below.
//
// Run: node scripts/validate-plugin.mjs

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(repo, "plugins", "dial");

// The remote MCP server's tools. Update when the server adds or renames one.
// Not read from src/mcp: the local server also has tools the remote one lacks.
const TOOLS = new Set([
  "add_policy_entries",
  "create_group",
  "create_policy",
  "delete_policy",
  "get_account_status",
  "get_call",
  "get_policy",
  "list_calls",
  "list_contacts",
  "list_groups",
  "list_messages",
  "list_numbers",
  "list_policies",
  "lookup_number",
  "place_call",
  "purchase_number",
  "remove_policy_entries",
  "reply_to_message",
  "send_message",
  "set_number_properties",
  "start_typing",
  "stop_call",
  "stop_typing",
  "update_policy",
  "wait_for_event",
]);

const errors = [];
const fail = (msg) => errors.push(msg);

async function exists(p) {
  try {
    await stat(path.join(root, p));
    return true;
  } catch {
    return false;
  }
}

async function readJson(p) {
  try {
    return JSON.parse(await readFile(path.join(root, p), "utf8"));
  } catch (err) {
    fail(`${p}: ${err.message}`);
    return null;
  }
}

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const keys = new Set();
  for (const line of match[1].split("\n")) {
    const key = line.match(/^([a-z][a-z-]*):/);
    if (key) keys.add(key[1]);
  }
  return keys;
}

const marketplace = JSON.parse(
  await readFile(path.join(repo, ".cursor-plugin/marketplace.json"), "utf8"),
);
const entry = marketplace.plugins?.find((p) => p.name === "dial");
if (path.resolve(repo, entry?.source ?? "") !== root) {
  fail(".cursor-plugin/marketplace.json: the dial entry must point at ./plugins/dial");
}

const cursor = await readJson(".cursor-plugin/plugin.json");
const grok = await readJson(".grok-plugin/plugin.json");

for (const [label, manifest] of [[".cursor-plugin", cursor], [".grok-plugin", grok]]) {
  if (!manifest) continue;
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(manifest.name ?? "")) fail(`${label}: name must be lowercase kebab-case`);
  if (manifest.logo && !(await exists(manifest.logo))) fail(`${label}: logo ${manifest.logo} not found`);
}
if (cursor && grok) {
  for (const field of ["name", "version", "description", "license"]) {
    if (cursor[field] !== grok[field]) fail(`manifests disagree on "${field}"`);
  }
}
if (cursor?.mcpServers && !(await exists(cursor.mcpServers))) fail(`.cursor-plugin: ${cursor.mcpServers} not found`);

const mcp = await readJson("mcp.json");
const dotMcp = await readJson(".mcp.json");
if (mcp?.mcpServers?.dial?.url !== dotMcp?.mcpServers?.dial?.url) fail("mcp.json and .mcp.json point at different URLs");

const docs = [];
for (const dir of await readdir(path.join(root, "skills"))) {
  docs.push({ file: `skills/${dir}/SKILL.md`, name: dir });
}
for (const file of await readdir(path.join(root, "commands"))) {
  if (file.endsWith(".md")) docs.push({ file: `commands/${file}`, name: file.replace(/\.md$/, "") });
}

const skillNames = new Set((await readdir(path.join(root, "skills"))));
for (const { file, name } of docs) {
  let text;
  try {
    text = await readFile(path.join(root, file), "utf8");
  } catch {
    fail(`${file}: missing`);
    continue;
  }
  const keys = frontmatter(text);
  if (!keys) {
    fail(`${file}: missing frontmatter`);
    continue;
  }
  for (const key of ["name", "description"]) if (!keys.has(key)) fail(`${file}: frontmatter needs "${key}"`);
  if (!text.includes(`name: ${name}\n`)) fail(`${file}: frontmatter name must be "${name}"`);

  for (const [, tool] of text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) {
    if (!TOOLS.has(tool)) fail(`${file}: names unknown tool "${tool}"`);
  }
  for (const [, skill] of text.matchAll(/the `([a-z-]+)` skill/g)) {
    if (!skillNames.has(skill)) fail(`${file}: names unknown skill "${skill}"`);
  }
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ ${docs.length} skills and commands, both manifests and the MCP config are valid`);
