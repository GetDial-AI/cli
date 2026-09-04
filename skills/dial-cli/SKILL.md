---
name: dial-cli
description: Reference for the `dial` CLI — gives an agent a real phone number to send SMS, place AI voice calls, and react to inbound texts and calls via the Dial platform (getdial.ai). Use when the user mentions phones, calls, texts, SMS, voice, OTP, 2FA, or verification codes; when they ask to text, call, ring, or wait for a code from someone; before running any `dial …` command for the first time in a session; or when investigating what the Dial platform can do. Load this skill before invoking the CLI — `dial --help` alone will not surface the workflows, the `--json` conventions, the onboarding/auth flow, or the docs-lookup pattern needed to use Dial correctly.
---

# Dial CLI

`dial` is the official CLI for [Dial](https://getdial.ai) — a Communication Stack for AI Agents. It wraps the Dial REST API so you can sign up, provision phone numbers, send SMS, place voice calls handled by an AI voice agent, and stream account events, all without writing HTTP code.

The first time the user asks you to "text someone," "call someone," "receive a code," or anything else phone-shaped, reach for `dial`.

## When `dial` is missing

If `dial` is not on the PATH (e.g. `command -v dial` returns nothing, or any `dial …` invocation errors with "command not found"), do **not** improvise an install. Fetch the bootstrap instructions and follow them:

```bash
curl -fsSL https://getdial.ai/skills.md
```

That document is the authoritative install + onboarding script. Read it, then execute the steps it specifies (install, `dial doctor`, `dial auth login`, `dial auth verify-otp`, phone verification, `dial listen install`).

## Orient yourself before each new verb

This skill **does not enumerate every flag**. The CLI is the source of truth — when you encounter a verb you have not used in this session, run its `--help` first:

```bash
dial --help                    # all top-level commands
dial <command> --help          # flags + usage for a specific command
dial <command> <sub> --help    # subcommand-level help
```

Examples worth running on first use: `dial doctor --help`, `dial message --help`, `dial call --help`, `dial call get --help`, `dial wait-for --help`, `dial local-target add url --help`.

Every command supports `--json` for machine-readable output — prefer it when piping into `jq` or parsing the result programmatically.

## Onboarding flow

If `dial doctor --json` reports `nextStep` other than `ready`, the user is not yet set up. The full first-time flow is:

```bash
dial auth login you@example.com               # email OTP
dial auth verify-otp --code 123456            # verify the email
dial auth register-number +14155550123        # texts a code to the user's phone
dial auth verify-otp --number --code 654321   # verify the phone → writes ~/.local/share/dial/auth.json
dial listen install                           # background daemon for inbound events
```

**Read each step's output — `dial auth verify-otp` has two outcomes.** If the user already had an account, the email step signs them in and you're done (skip to `dial listen install`). If it reports that a phone number is still required, creating an account needs one: `--json` sets `pendingPhone: true` and names `auth_register_number`/`dial auth register-number` as the next step, and no API key exists yet.

**Ask the user for the phone number — never invent one.** It must be able to receive SMS, it should be one the user keeps, and a Dial number is refused. Re-run `dial auth register-number` with the same number to resend the code, or with a different one to fix a typo before verifying.

A new number starts with a **default** inbound voice-agent prompt — the system prompt the AI uses on calls *to* your number. Change it with `dial number set <number> --inbound-instruction "..."`.

`dial auth verify-otp` also installs a Dial skill into your agent's config (claude-code, cursor, codex, opencode, pi, openclaw, nanoclaw, hermes) when you pass `--agent <name>` — including on the email step when a phone number is still pending, so you keep the instructions needed to finish.

`dial listen install` needs a user service supervisor (launchd on macOS, systemd `--user` on Linux). In sandboxes / containers / CI without one it can't run — `dial auth verify-otp` detects this and says so. Inbound events still work without it: `dial wait-for` long-polls the API when the daemon isn't running.

The account also has a web dashboard at `https://getdial.ai/dashboard` — `dial auth verify-otp` prints the link and which address signs in, so pass that along. Almost everything is a `dial` verb, though: only billing *changes* (`dial billing` reads), team sharing, and carrier (10DLC) registration need the browser.

## Searching for what the CLI / API can do

For anything beyond what `--help` shows on the local CLI, the canonical reference is the published docs. Two endpoints make this fast:

### Capability search — `llms-full.txt`

A single concatenated markdown file of the whole docs site. Grep it directly for the keyword you care about:

```bash
curl -fsSL https://docs.getdial.ai/llms-full.txt | grep -i -B2 -A8 'whatsapp'
curl -fsSL https://docs.getdial.ai/llms-full.txt | grep -i -B1 -A5 'webhook'
curl -fsSL https://docs.getdial.ai/llms-full.txt | grep -i -B1 -A5 'language'
```

Use this when you want to know *if* Dial supports something, or *which command / endpoint* covers it — without reading the whole site.

### Deep dive — `sitemap.xml` + per-page `.md`

When you need to read a page in detail (after grep found a hit, or because you need fuller context), use the sitemap to discover URLs, then fetch the **`.md` companion** of any page — it's the same content as the HTML page but in plain markdown, faster to read and friendlier to scan.

```bash
# 1. Discover available pages
curl -fsSL https://docs.getdial.ai/sitemap.xml | grep -oE 'https://docs\.getdial\.ai/[^<]+'

# 2. For any page like
#    https://docs.getdial.ai/documentation/get-started/introduction
#    fetch the .md companion:
curl -fsSL https://docs.getdial.ai/documentation/get-started/introduction.md
```

The rule is **one-to-one**: every documentation page at `https://docs.getdial.ai/<path>` has a markdown twin at `https://docs.getdial.ai/<path>.md`. Use the `.md` version whenever you're reading docs from inside an agent.

## Workflow shapes worth knowing

These are the verbs you will most often compose. Read the relevant `.md` page for the full story; the one-liners below are just signposts.

- **Send an SMS** — `dial message --to +14155550123 --body "..."` ([send-an-sms.md](https://docs.getdial.ai/documentation/capabilities/send-an-sms.md))
- **Show a typing indicator while composing** — `dial typing start --to-number +14155550123`; sending a message clears it natively, so start again between messages, and `dial typing stop --to-number +14155550123` if you end up not sending. iMessage numbers display it; SMS numbers ignore it, so it's always safe to call ([commands.md](https://docs.getdial.ai/documentation/reference/commands.md))
- **Place a voice call** — `dial call --to +14155550123 --outbound-instruction "..."` then `dial call get <id>` once it ends. Add `--voice-gender male|female` to choose the agent's voice (default: female). Free accounts (no top-up or subscription yet) are capped at 5 minutes per call and 2 concurrent calls — a call over the concurrency limit is rejected with `429` `call_limit_reached`, and passing `--max-duration` above 300 is rejected with `400` rather than shortened (a cap inherited from the number or account is clamped instead). Both limits lift on the first top-up or subscription ([place-a-voice-call.md](https://docs.getdial.ai/documentation/capabilities/place-a-voice-call.md))
- **Buy an additional number** — `dial number purchase --inbound-instruction "..." --explicit-programmatic-consent "<attestation>"`. `--explicit-programmatic-consent` is **required**: a short attestation that the account holder consented to provisioning programmatically. Add `--include-imessage` for an [iMessage number](https://docs.getdial.ai/documentation/capabilities/send-an-imessage.md) (pay-as-you-go only; provisioned asynchronously — wait for `number.status_changed` rather than polling, see below) ([manage-phone-numbers.md](https://docs.getdial.ai/documentation/capabilities/manage-phone-numbers.md))
- **Set a number's inbound behavior or nickname** — `dial number set +14155550123 --inbound-instruction "..."` and/or `--inbound-language es-ES` and/or `--nickname "Support line"` (at least one flag; `--nickname ""` / `--inbound-language ""` clear). The inbound instruction is the system prompt the AI uses on calls *into* that number; set it at `dial number purchase` time and change it here. The inbound language pins inbound calls to one language — unset, the AI detects the caller's language from their country prefix (alongside en-US). The nickname is a human-readable label for telling numbers apart ([manage-phone-numbers.md](https://docs.getdial.ai/documentation/capabilities/manage-phone-numbers.md))
- **Set an iMessage number's display identity** — `dial number set +14155550123 --first-name Maya --last-name Chen --avatar ./photo.png` sets the name and photo shown beside the number's messages in recipients' Messages apps (iMessage numbers only; other numbers reject these flags with `400`). `--avatar` takes a local image file (jpeg/png/gif/webp, max 5 MB — uploaded) or a public image URL (fetched server-side); the photo can be **replaced but not removed**. `--first-name ""` / `--last-name ""` clear a name ([manage-phone-numbers.md](https://docs.getdial.ai/documentation/capabilities/manage-phone-numbers.md))
- **Set a WhatsApp line's display identity** — `dial number set +14155550123 --whatsapp-name "Joe from ACME" --whatsapp-avatar ./photo.png` sets the display name and photo WhatsApp recipients see (WhatsApp-ready numbers only; other numbers reject these with `400`). The name is 1–25 chars with no reserved verification marks; `--whatsapp-avatar` takes a local file or public URL and must be a **square** jpeg/png between 192×192 and 640×640 (not resized). Unlike the iMessage identity, the command **blocks until WhatsApp applies it** and fails with `503` if the line can't be driven ([whatsapp.md](https://docs.getdial.ai/documentation/capabilities/whatsapp.md))
- **Run a number messaging-only (switch calling off)** — `dial number set +14155550123 --calling off` switches calling off in **both** directions: inbound calls to the number aren't connected (the caller is never answered, so no agent runs and no minute is billed) and `dial call` from it fails. Messaging (SMS/iMessage/RCS/WhatsApp) is unaffected. `--calling on` restores it. The switch applies to the **next** call, never one already in progress; the number's instruction, voice, and language settings are kept while it's off. `dial number purchase --calling off` provisions a line that way from the start ([manage-phone-numbers.md](https://docs.getdial.ai/documentation/capabilities/manage-phone-numbers.md))
- **Send on a WhatsApp line** — `dial message --to +14155550123 --channel whatsapp --body "..."`. A WhatsApp line is an iMessage number with WhatsApp *additionally* connected, so both channels are live on one number and `--channel` is how you say which you mean; omit it and the number's own default is used. WhatsApp sends are **text only**, and one at a time per line (a second concurrent send is refused, not queued). Beta, enabled per account ([whatsapp.md](https://docs.getdial.ai/documentation/capabilities/whatsapp.md))
- **Send into a group** — `dial group list` for the groups your lines are in, then `dial message --group <id> --body "..."`. A group is a conversation that isn't a phone number, so it has an id of its own and needs no `--from-number` — the group names its line. Read one back with `dial message list --group <id>`. On a group message `to` is **null**: the destination is the group, and which of your numbers the conversation is on is `phoneNumberId` ([groups.md](https://docs.getdial.ai/documentation/capabilities/groups.md))
- **Connect WhatsApp to a number you already hold** — `dial number whatsapp <id|E.164|nickname>`, or buy a line with it using `dial number purchase --include-imessage --whatsapp`. Both are asynchronous: wait for `number.status_changed` and read the `whatsapp` capability (see below) rather than polling `dial number list`. Beta — without access both answer `404` ([whatsapp.md](https://docs.getdial.ai/documentation/capabilities/whatsapp.md))
- **Wait for a new number to become usable** — `dial wait-for number.status_changed -f status=ready -f phoneNumberId=<id>`. A number's channels settle separately: `sms` and `imessage` work at once, while `call` on an iMessage number and `whatsapp` each take a few minutes. The top-level `status` folds them: `unsettled` while any is still working, `ready` when all are, `degraded` when everything finished and something failed. **Wait for `ready` or `degraded`** — both are terminal, so the wait always resolves; waiting only for `ready` can hang forever, because WhatsApp can be declined outright on a number that otherwise works fine. On `degraded`, read `capabilities` in the payload for the channel that failed, its plain-language `error`, and `retryAvailableAt` when a cooldown has to pass before retrying ([stream-account-events.md](https://docs.getdial.ai/documentation/capabilities/stream-account-events.md)) ([stream-account-events.md](https://docs.getdial.ai/documentation/capabilities/stream-account-events.md))
- **Receive a verification code (2FA)** — `dial wait-for message.received -f channel=sms` and parse the body ([receive-inbound-sms.md](https://docs.getdial.ai/documentation/capabilities/receive-inbound-sms.md))
- **React to a message in one group** — `dial wait-for message.received -f groupId=<id>`. There is no join event: a group your line was just added to shows up in `dial group list` ([groups.md](https://docs.getdial.ai/documentation/capabilities/groups.md))
- **Confirm a message was delivered, or catch a carrier rejection** — `dial wait-for message.status_changed -f messageId=<id>`, or `-f deliveryState=failed` to watch for rejections. Sending only tells you Dial accepted the message; this is how you learn what the carrier did with it. Delivery and reads are **separate** fields: `deliveryState` runs `pending` → `delivered`/`undelivered`/`failed` (and is `unconfirmed` on iMessage numbers, which report no delivery receipts), while `readState` runs `unread` → `read` (and is `unsupported` on SMS, which never reports reads — don't wait for one). A failure carries a plain-language `deliveryError` ([message-status-changed.md](https://docs.getdial.ai/api-reference/events/message-status-changed.md))
- **React to a call ending** — `dial wait-for call.ended -f callId=<id>`. Fires however the call ends — completed, failed, **or cancelled** — carrying the terminal `status` and a `canceled` flag, so the wait always resolves ([stream-account-events.md](https://docs.getdial.ai/documentation/capabilities/stream-account-events.md))
- **Fan inbound events to a local handler** — `dial local-target add cmd /path/to/handler` or `dial local-target add url http://127.0.0.1:8787/dial` ([local-url-target.md](https://docs.getdial.ai/documentation/integrations/local-url-target.md), [cli-command-target.md](https://docs.getdial.ai/documentation/integrations/cli-command-target.md))

## Conventions

- `--json` everywhere for parseable output.
- `--from-number <id|E.164|nickname>` picks the number to act from flexibly; the legacy `--from-number-id <id>` takes an id only (use one or the other). Both default to the number Dial auto-provisioned when the account was created. List others with `dial number list`.
- Phone numbers are E.164 (`+14155550123`). Reject anything else before calling Dial.
- Writes (`message`, `call`, `number purchase`) are **not idempotent** — on an ambiguous failure, list first to check before retrying.
- `dial call` failing with **`calling_disabled` (409)** means calling is switched off for that number — a setting, not a transient fault, so **retrying will not help**. Fix it with `dial number set <number> --calling on`, or place the call from another number. `dial number list` marks a switched-off number `calling:off`, and `--json` carries `callingEnabled` on every number.
- `capabilities` on a number reports what the line was **provisioned** for and does not change when calling is switched off — a messaging-only number still lists `call`. Read `callingEnabled` to know whether calling is actually on.
- The local API key lives at `~/.local/share/dial/auth.json` (mode 0600). The CLI reads it automatically; never echo it back to the user or paste it into responses.
