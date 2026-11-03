# Dial plugin for Grok Bot and Cursor

Give your agent a real phone number. With Dial connected, your agent can send
and read SMS, iMessage and WhatsApp, place AI voice calls, read call
transcripts, and tell you who reached you and what still needs a reply.

It asks you before it texts or calls anyone.

## Install

- **Grok Bot** and **Cursor**: install **Dial** from the marketplace once it's
  listed there.
- **Grok Bot, in the meantime**: send the bot "Add this MCP server:
  https://getdial.ai/mcp". That connects the Dial tools, without this plugin's
  commands and skills.
- **Cursor, from this repo**: copy this folder (`plugins/dial`) into
  `~/.cursor/plugins/local/dial` and restart Cursor.

The first time your agent uses Dial, sign in to your Dial account in the
browser. There's no API key to copy. Don't have an account yet? Create one at
[getdial.ai](https://getdial.ai).

## Commands

| Command | What it does |
|---|---|
| `/dial-inbox [today \| this week]` | Who texted and called, and what still needs a reply |
| `/dial-followups [3 days]` | Conversations waiting on you, with drafted replies |
| `/dial-report [this week]` | Messages and calls, compared with the period before |
| `/dial-call-summary [number]` | A call's outcome, key points, and next steps |

Each of these can also run as a Grok Bot routine, for example a `/dial-inbox`
briefing every morning.

## Or just ask

- "Text +14155550123: running late, there in 10."
- "Did the dentist text back?"
- "Call the restaurant and book a table for four at 8pm Friday, then tell me
  how it went."
- "Wait for the verification code and paste it in."

## What's inside

- `mcp.json`: connects to Dial's hosted MCP server at `https://getdial.ai/mcp`.
- `skills/dial`: how to read, send and wait for messages, and manage numbers.
- `skills/dial-calls`: how to place calls, write the call prompt, and read
  transcripts.
- `commands/`: the four commands above.

## Links

- [Dial docs](https://docs.getdial.ai)
- [Dial MCP server](https://docs.getdial.ai/integrations/tools/mcp)
- Support: support@getdial.ai

## License

MIT
