# @getdial/cli

[![smithery badge](https://smithery.ai/badge/getdial-ai/dial)](https://smithery.ai/servers/getdial-ai/dial)

The official command-line interface for [Dial](https://getdial.ai) — a communication stack for AI agents. Provision phone numbers, send SMS, place AI voice calls, and react to inbound events, all from your terminal. The CLI wraps the [Dial REST API](https://docs.getdial.ai) so you never have to write HTTP code.

## Installation

Install globally from npm:

```bash
npm install -g @getdial/cli
```

Or use the bootstrap script, which installs the CLI and walks you through sign-up:

```bash
curl -fsSL https://getdial.ai/install | bash
```

Requires **Node.js 22.19+**.

## Quick start

```bash
dial signup you@example.com      # email a 6-digit sign-up code
dial onboard --code 123456 \     # verify the code and provision your account
  --inbound-instruction "You are my receptionist. Greet the caller and find out what they need."
dial doctor                      # check account state and what to do next
```

Once onboarded, your API key is saved locally and the CLI uses it automatically.

```bash
# Send an SMS
dial message --to +14155550123 --body "Hello from Dial"

# Place an AI voice call
dial call --to +14155550123 --outbound-instruction "You are a helpful scheduling assistant."

# Wait for an inbound event (e.g. a verification code)
dial wait-for message.received --field to=+14155550123
```

## Commands

| Command | Description |
| --- | --- |
| `dial doctor` | Report account state and what to do next. |
| `dial signup <email>` | Email a 6-digit sign-up code. |
| `dial onboard --code <code>` | Verify the code and finish onboarding. |
| `dial number list` | List the phone numbers on your account. |
| `dial number purchase` | Purchase an additional phone number. |
| `dial number set <number>` | Update a number's inbound instruction. |
| `dial message` | Send an SMS. |
| `dial message list` | List recent messages. |
| `dial message reply` | Reply or react to a message. |
| `dial call` | Place an outbound AI voice call. |
| `dial call list` | List recent calls. |
| `dial call get <id>` | Fetch a single call — status, duration, transcript. |
| `dial wait-for <event>` | Block until a matching account event arrives. |
| `dial listen install` | Install the background event daemon. |
| `dial listen status` | Report the daemon's state and recent events. |
| `dial listen uninstall` | Stop and remove the daemon. |
| `dial local-target add url <url>` | Fan out events to a local HTTP endpoint. |
| `dial local-target add cmd <path>` | Run an executable once per event. |
| `dial local-target list` | List registered fan-out targets. |
| `dial local-target remove <id>` | Unregister a fan-out target. |
| `dial mcp` | Run a local stdio MCP server exposing every command as an agent tool. |

Run `dial --help` for the full command tree, or `dial <command> --help` for a specific command's flags. Every command accepts `--json` for machine-readable output (except `dial mcp`, which speaks JSON-RPC on stdout).

## Configuration

| Variable | Description |
| --- | --- |
| `DIAL_API_URL` | Target a non-default Dial deployment. |

Your API key is stored at `~/.local/share/dial/auth.json` (honoring `XDG_DATA_HOME`).

## Use from an AI agent

The CLI ships with a [skill](https://docs.getdial.ai/integrations/tools/cli-skill) that teaches AI coding agents how to drive `dial`. Install it into your agent's config during onboarding:

```bash
dial onboard --code 123456 --agent claude-code
```

Supported agents: `claude-code`, `cursor`, `codex`, `opencode`, `pi`, `openclaw`, `nanoclaw`, `hermes`.

## Local MCP server

`dial mcp` runs a local [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, exposing every command as an agent tool. Point a local MCP client at `dial mcp` as the server command — it reuses the API key saved by `dial onboard` (no OAuth, no config). It's the local counterpart to the hosted [Remote MCP](https://docs.getdial.ai/integrations/tools/remote-mcp) server, with the same operational tools plus the local-only verbs (`signup`, `onboard`, `listen`, `local-target`).

```bash
# Claude Code, for example
claude mcp add dial -- dial mcp
```

See the [Local MCP](https://docs.getdial.ai/integrations/tools/local-mcp) docs for client setup.

## Documentation

Full documentation lives at **[docs.getdial.ai](https://docs.getdial.ai)** — including the [CLI reference](https://docs.getdial.ai/documentation/cli/commands) and the [listen service](https://docs.getdial.ai/documentation/cli/listen-service) guide.

## License

MIT
