# AGENTS.md

Instructions for AI coding agents working in this repository. For using Dial from an agent (not
changing this code), skip to [Using Dial from an agent](#using-dial-from-an-agent).

## What this is

`@getdial/cli` is the official Node.js CLI for [Dial](https://getdial.ai), a communication stack for
AI agents: phone numbers, SMS / iMessage / WhatsApp messaging, AI voice calls, and account events.
The CLI wraps the Dial REST API. The same package also ships:

- **an agent skill** at `skills/dial-cli/SKILL.md`, installed into agents by
  `dial auth verify-otp --agent <agent>` (and `dial onboard --agent`) and packed into
  `skills.tar.gz` at publish time;
- **a local MCP server** (`dial mcp`, or `npx -y @getdial/cli mcp`) in `src/mcp/`, the stdio
  counterpart to the hosted remote MCP server at `https://getdial.ai/mcp`.

## The docs are the spec

[docs.getdial.ai](https://docs.getdial.ai) defines the REST contract, the CLI commands and flags,
and the error shapes. This CLI implements what the docs declare; it does not invent behavior.

- Do not add a command, flag, default or output field that the docs do not define. If a change needs
  one, the docs change comes first (in the separate docs repository), then the CLI.
- Every CLI command is built on documented REST endpoints. If the endpoint you need does not exist,
  stop: that is a server change, not a CLI change.
- Keep the derived surfaces in step with the commands in the same change: the CLI skill
  (`skills/dial-cli/SKILL.md`), the local MCP tools (`src/mcp/tools/`), and the command table in
  `README.md`. A verb that exists but is not taught in the skill, or a tool present in one MCP server
  and missing from the other, is drift.
- Expose only Dial's own identifiers and vendor-neutral fields. Never surface the name, ids or raw
  error text of a third-party provider that Dial is built on, in output, error messages, or docs.

## Layout

```
src/
  cli.ts            command tree (commander); every verb is registered here
  commands/         one folder or file per verb (message/, call/, number/, listen/, ...)
  lib/ops/          shared operations that call the REST API; used by both commands and MCP tools
  lib/              API client, local state and paths, event fan-out, the listen supervisor, logging
  mcp/              local MCP server: server.ts, register.ts, tool.ts, tools/ (one file per tool)
skills/dial-cli/    the CLI skill (SKILL.md)
plugins/dial/       Grok Bot / Grok Build / Cursor plugin (remote MCP, skills, slash commands)
.cursor-plugin/     marketplace entry pointing at plugins/dial
plugin.json         Agent Plugins manifest for this repo (agent-plugins.org)
mcp.json            Agent Plugins MCP config: remote and local Dial MCP servers
server.json         MCP Registry entry for the remote server
scripts/            validate-plugin.mjs (checks plugins/dial)
```

Put new REST logic in `src/lib/ops/` and call it from both the command in `src/commands/` and, when
the verb is agent-facing, a tool in `src/mcp/tools/` (registered in `src/mcp/tools/index.ts`). Do
not duplicate HTTP calls inside commands or tools.

## Commands

Requires Node.js 22.19 or newer.

```bash
npm ci                    # install (CI uses the frozen lockfile)
npm run build             # tsc -p .  -> dist/
npm test                  # node --import tsx --test (tests are *.test.ts next to the source)
npm run lint              # biome lint src
npm run format:check      # biome format src (CI gate)
npm run format            # biome format --write src
node scripts/validate-plugin.mjs   # validate plugins/dial
```

Run the CLI from source with `node --import tsx src/cli.ts <args>`, or `npm run build` then
`node dist/cli.js <args>`. `DIAL_API_URL` points it at a non-default Dial deployment.

Before you finish, run `npm run format:check`, `npm run lint` and `npm test` - CI runs the same steps
in that order.

## Conventions

- TypeScript, ES modules, imports with explicit `.ts` extensions.
- Formatting and linting are Biome (`biome.json`): 2-space indent, 100-column lines, double quotes,
  semicolons, trailing commas, recommended lint rules. Do not hand-format against it.
- Every command accepts `--json` for machine-readable output; keep that working for new commands.
  `dial mcp` is the exception: it speaks JSON-RPC on stdout, so nothing else may write to stdout
  there.
- Add or update the colocated `*.test.ts` when you change behavior.
- **Version bumps:** CI requires a strictly greater `package.json` version whenever a PR touches
  `src/`, `package.json` or `package-lock.json`. Any change to `server.json` must bump its own
  `version` too.
- Commit and PR titles say what the change does in plain words (for example
  `cli: Add --channel to dial group create`).

## Using Dial from an agent

If you are an agent that wants to use Dial (send a text, place a call, wait for a code) rather than
change this code:

- Read [`skills/dial-cli/SKILL.md`](skills/dial-cli/SKILL.md) for the CLI workflows and
  conventions, or the hosted onboarding skill at <https://getdial.ai/skills.md>.
- Or connect an MCP client to the remote server `https://getdial.ai/mcp` (Streamable HTTP, browser
  sign-in) or run the local one with `npx -y @getdial/cli mcp` (uses the API key saved by the CLI).
- Full documentation: <https://docs.getdial.ai>.
