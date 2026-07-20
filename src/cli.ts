#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import { VERSION } from "./lib/version.ts";
import { runDoctor } from "./commands/doctor.ts";
import { runBilling } from "./commands/billing.ts";
import { runSignup } from "./commands/signup.ts";
import { runOnboard } from "./commands/onboard.ts";
import { runListen } from "./commands/listen/index.ts";
import { runListenInstall } from "./commands/listen/install.ts";
import { runListenUninstall } from "./commands/listen/uninstall.ts";
import { runListenStatus } from "./commands/listen/status.ts";
import { runWaitFor } from "./commands/wait-for.ts";
import { runNumberList } from "./commands/number/list.ts";
import { runNumberPurchase } from "./commands/number/purchase.ts";
import { runNumberSet } from "./commands/number/set.ts";
import { runMessageSend } from "./commands/message/send.ts";
import { runMessageReply } from "./commands/message/reply.ts";
import { runMessageList } from "./commands/message/list.ts";
import { runTypingStart } from "./commands/typing/start.ts";
import { runTypingStop } from "./commands/typing/stop.ts";
import { runCallSend } from "./commands/call/send.ts";
import { runCallList } from "./commands/call/list.ts";
import { runCallGet } from "./commands/call/get.ts";
import { runLocalTargetAddUrl } from "./commands/local-target/add-url.ts";
import { runLocalTargetAddCmd } from "./commands/local-target/add-cmd.ts";
import { runLocalTargetRemove } from "./commands/local-target/remove.ts";
import { runLocalTargetList } from "./commands/local-target/list.ts";
import { runMcp } from "./commands/mcp.ts";
import { runUpdate } from "./commands/update.ts";
import { runUninstall } from "./commands/uninstall.ts";
import { maybeAutoUpdate } from "./lib/update.ts";
import { isSandbox, SANDBOX_DISABLED_COMMANDS, sandboxDisabledMessage } from "./lib/sandbox.ts";

// Sandbox mode (ephemeral agent container behind the OneCLI proxy): hide and
// disable machine-lifecycle / onboarding commands, and let requests go out
// keyless so the proxy injects auth. Computed once (memoized in lib/sandbox).
const sandbox = isSandbox();

const program = new Command();

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || String(parsed) !== value.trim()) {
    throw new InvalidArgumentError(`must be a positive integer, got: ${value}`);
  }
  return parsed;
}

program
  .name("dial")
  .description("Dial CLI — set up your account and run the listen service.")
  .version(VERSION)
  .enablePositionalOptions();

// Hourly detached self-update; a no-op for exempt commands, non-npm installs,
// fresh stamps, and DIAL_NO_AUTO_UPDATE=1. Never touches stdout/stderr.
program.hook("preAction", (_thisCommand, actionCommand) => {
  maybeAutoUpdate(actionCommand.name());
});

program
  .command("doctor")
  .description("Report state and what to do next.")
  .option("--json", "machine-readable output")
  .action(async (opts) => process.exit(await runDoctor({ json: !!opts.json })));

program
  .command("billing")
  .description(
    "Show account billing: balance, plan, per-number mode, recent activity. GET /api/v1/billing.",
  )
  .option("--json", "machine-readable output")
  .action(async (opts) => process.exit(await runBilling({ json: !!opts.json })));

if (!sandbox)
  program
    .command("signup <email>")
    .description("Request an email OTP for the given address.")
    .option("--force", "overwrite any pending signup")
    .option("--json", "machine-readable output")
    .action(async (email, opts) =>
      process.exit(await runSignup(email, { force: !!opts.force, json: !!opts.json })),
    );

if (!sandbox)
  program
    .command("onboard")
    .description("Verify the OTP and finish onboarding.")
    .option(
      "--verification-id <id>",
      "explicit verification id (falls back to local pending signup)",
    )
    .option(
      "--code <code>",
      "6-digit OTP from your email (omit if already signed in — the command just installs the --agent skill and skips verification)",
    )
    .option(
      "--inbound-instruction <text>",
      "system prompt for inbound calls to your auto-provisioned number (required for a new account; ignored when signing in)",
    )
    .option(
      "--agent <name>",
      "install the Dial skill into the named agent's config dir. One of: claude-code, cursor, codex, opencode, pi, openclaw, nanoclaw, hermes. Repeatable.",
      (v: string, prev: string[] = []) => [...prev, v],
      [] as string[],
    )
    .option("--json", "machine-readable output")
    .action(async (opts) =>
      process.exit(
        await runOnboard({
          verificationId: opts.verificationId,
          code: opts.code,
          inboundInstruction: opts.inboundInstruction,
          agents: opts.agent as string[],
          json: !!opts.json,
        }),
      ),
    );

if (!sandbox) {
  const listen = program
    .command("listen")
    .description("Run the listen worker (used by launchd/systemd).")
    .action(async () => process.exit(await runListen()));

  listen
    .command("install")
    .description("Install the listen daemon (launchd or systemd user unit).")
    .option("--json", "machine-readable output")
    .action(async (opts) => process.exit(await runListenInstall({ json: !!opts.json })));

  listen
    .command("uninstall")
    .description("Stop and remove the listen daemon.")
    .option("--json", "machine-readable output")
    .action(async (opts) => process.exit(await runListenUninstall({ json: !!opts.json })));

  listen
    .command("status")
    .description("Report listen daemon state and last events.")
    .option("--json", "machine-readable output")
    .action(async (opts) => process.exit(await runListenStatus({ json: !!opts.json })));
}

const number = program.command("number").description("Manage your Dial phone numbers.");

number
  .command("list")
  .description("List the numbers on your account. GET /api/v1/numbers.")
  .option("--json", "machine-readable output")
  .action(async (opts) => process.exit(await runNumberList({ json: !!opts.json })));

number
  .command("purchase")
  .description("Purchase an additional phone number. POST /api/v1/numbers.")
  .requiredOption("--inbound-instruction <text>", "system prompt for inbound calls to this number")
  .requiredOption(
    "--explicit-programmatic-consent <text>",
    "required attestation that the account holder consented to provisioning this number programmatically (stored on the number)",
  )
  .option(
    "--inbound-voice-gender <male|female>",
    "voice gender for inbound calls (default: female; pass male to override)",
  )
  .option(
    "--inbound-language <bcp47>",
    "language tag inbound calls are pinned to (default: detect from the caller's country prefix, alongside en-US)",
  )
  .option(
    "--area-code <code>",
    "preferred US area code (only US numbers can be provisioned; ignored with --include-imessage)",
  )
  .option(
    "--include-imessage",
    "provision an iMessage number (pay-as-you-go only; provisioned asynchronously — poll `dial number list` until ready)",
  )
  .option("--json", "machine-readable output")
  .action(async (opts) =>
    process.exit(
      await runNumberPurchase({
        inboundInstruction: opts.inboundInstruction,
        explicitProgrammaticConsent: opts.explicitProgrammaticConsent,
        inboundVoiceGender: opts.inboundVoiceGender,
        inboundLanguage: opts.inboundLanguage,
        areaCode: opts.areaCode,
        includeImessage: !!opts.includeImessage,
        json: !!opts.json,
      }),
    ),
  );

number
  .command("set <number>")
  .description("Update a number's properties (at least one flag). PATCH /api/v1/numbers/<id>.")
  .option("--inbound-instruction <text>", "new system prompt for inbound calls to this number")
  .option(
    "--inbound-voice-gender <male|female>",
    'voice gender for inbound calls; pass "" to clear (reverts to the default, female)',
  )
  .option(
    "--inbound-language <bcp47>",
    'language tag inbound calls are pinned to; pass "" to clear (reverts to detecting from the caller\'s country prefix)',
  )
  .option(
    "--nickname <text>",
    'human-readable label for the number, e.g. "Support line"; pass "" to clear',
  )
  .option(
    "--max-call-duration <seconds>",
    "call duration cap for this number, in seconds, applied as a hard ceiling to both inbound and outbound calls (the smallest of the per-number, account, and per-call caps wins)",
    (v: string) => {
      const n = parseInt(v, 10);
      if (!Number.isInteger(n) || n <= 0 || String(n) !== v.trim()) {
        console.error(`error: --max-call-duration must be a positive integer (seconds), got: ${v}`);
        process.exit(2);
      }
      return n;
    },
  )
  .option("--clear-max-call-duration", "remove the per-number call duration cap")
  .option("--json", "machine-readable output")
  .action(async (numberArg: string, opts) => {
    let maxCallDurationSeconds: number | null | undefined;
    if (opts.clearMaxCallDuration) {
      maxCallDurationSeconds = null;
    } else if (opts.maxCallDuration !== undefined) {
      maxCallDurationSeconds = opts.maxCallDuration as number;
    }
    process.exit(
      await runNumberSet({
        number: numberArg,
        inboundInstruction: opts.inboundInstruction,
        inboundVoiceGender: opts.inboundVoiceGender,
        inboundLanguage: opts.inboundLanguage,
        nickname: opts.nickname,
        maxCallDurationSeconds,
        json: !!opts.json,
      }),
    );
  });

const message = program
  .command("message")
  .description("Send an SMS, optionally with media (MMS). POST /api/v1/messages.")
  .option("--to <e164>", "destination phone number, E.164 (e.g. +14155551234)")
  .option("--body <text>", "message body")
  .option(
    "--from-number <ref>",
    "number to send from: id, owned E.164, or nickname (defaults to onboard's number; exclusive with --from-number-id)",
  )
  .option(
    "--from-number-id <id>",
    "phoneNumberId to send from (defaults to onboard's number; exclusive with --from-number)",
  )
  .option(
    "--media <path-or-url>",
    "media attachment: local file path (uploaded) or public http(s) URL (repeatable, max 10)",
    (v: string, prev: string[] = []) => [...prev, v],
    [] as string[],
  )
  .option(
    "--force-audio-file",
    "send an audio attachment as a regular file attachment instead of an iMessage voice message",
  )
  .option("--json", "machine-readable output")
  .action(async (opts) => {
    if (!opts.to) {
      console.error(
        "error: --to is required to send a message. Use `dial message list` to list, or `dial message --help` for usage.",
      );
      process.exit(2);
    }
    if (!opts.body && (opts.media ?? []).length === 0) {
      console.error(
        "error: provide --body, --media, or both — a message needs text or an attachment.",
      );
      process.exit(2);
    }
    process.exit(
      await runMessageSend({
        to: opts.to,
        body: opts.body,
        fromNumber: opts.fromNumber,
        fromNumberId: opts.fromNumberId,
        media: opts.media,
        forceAudioFile: !!opts.forceAudioFile,
        json: !!opts.json,
      }),
    );
  });

message
  .command("reply <messageId>")
  .description("Reply or react to a message. POST /api/v1/messages/:id/reply.")
  .option("--body <text>", "reply text (threads under the target on iMessage numbers)")
  .option(
    "--react <reaction>",
    "reaction: love|like|dislike|laugh|emphasize|question, or a single emoji",
  )
  .option("--json", "machine-readable output")
  .action(async (messageId: string, opts) => {
    if ((opts.body === undefined) === (opts.react === undefined)) {
      console.error(
        "error: provide exactly one of --body or --react. Use `dial message reply --help` for usage.",
      );
      process.exit(2);
    }
    process.exit(
      await runMessageReply({
        messageId,
        body: opts.body,
        react: opts.react,
        json: !!opts.json,
      }),
    );
  });

message
  .command("list")
  .description("List recent messages on your account. GET /api/v1/messages.")
  .option("--number-id <id>", "filter to a single phone number")
  .option("--direction <dir>", "inbound or outbound")
  .option("--since <iso8601>", "only messages created after this timestamp")
  .option("--json", "machine-readable output")
  .action(async (opts) =>
    process.exit(
      await runMessageList({
        numberId: opts.numberId,
        direction: opts.direction,
        since: opts.since,
        json: !!opts.json,
      }),
    ),
  );

const typing = program
  .command("typing")
  .description(
    "Show or clear a typing indicator. iMessage numbers display it; SMS numbers ignore it. POST /api/v1/typing.",
  );

typing
  .command("start")
  .description(
    "Show a typing indicator to a recipient, as if composing a message from your number.",
  )
  .option("--to-number <e164>", "recipient phone number, E.164 (e.g. +14155551234)")
  .option(
    "--from-number <ref>",
    "number the indicator appears from: id, owned E.164, or nickname (defaults to onboard's number)",
  )
  .option("--json", "machine-readable output")
  .action(async (opts) => {
    if (!opts.toNumber) {
      console.error("error: --to-number is required. Use `dial typing start --help` for usage.");
      process.exit(2);
    }
    process.exit(
      await runTypingStart({
        toNumber: opts.toNumber,
        fromNumber: opts.fromNumber,
        json: !!opts.json,
      }),
    );
  });

typing
  .command("stop")
  .description("Clear a typing indicator previously shown with `typing start`.")
  .option("--to-number <e164>", "recipient phone number, E.164 (e.g. +14155551234)")
  .option(
    "--from-number <ref>",
    "number the indicator appears from: id, owned E.164, or nickname (defaults to onboard's number)",
  )
  .option("--json", "machine-readable output")
  .action(async (opts) => {
    if (!opts.toNumber) {
      console.error("error: --to-number is required. Use `dial typing stop --help` for usage.");
      process.exit(2);
    }
    process.exit(
      await runTypingStop({
        toNumber: opts.toNumber,
        fromNumber: opts.fromNumber,
        json: !!opts.json,
      }),
    );
  });

const call = program
  .command("call")
  .description("Place an outbound voice call. POST /api/v1/calls.")
  .option("--to <e164>", "destination phone number, E.164 (e.g. +14155551234)")
  .option("--outbound-instruction <text>", "system prompt for the agent that will speak")
  .option(
    "--language <bcp47>",
    "BCP-47 language tag for the call (default: auto-detect from the destination number's country, alongside en-US)",
  )
  .option(
    "--voice-gender <male|female>",
    "voice gender for the agent (default: female; pass male to override)",
  )
  .option(
    "--transfer-to <e164>",
    "forward-to number, E.164: the agent waits for a real human (riding out hold/IVR) then cold-transfers the call here",
  )
  .option(
    "--idempotency-key <key>",
    "unique key (e.g. a UUID) making the placement idempotent: re-running with the same key returns the already-placed call instead of dialing again",
  )
  .option(
    "--from-number <ref>",
    "number to call from: id, owned E.164, or nickname (defaults to onboard's number; exclusive with --from-number-id)",
  )
  .option(
    "--from-number-id <id>",
    "phoneNumberId to call from (defaults to onboard's number; exclusive with --from-number)",
  )
  .option(
    "--max-call-duration <seconds>",
    "maximum call duration cap (seconds); call is terminated when this limit is reached",
    (v: string) => {
      const n = parseInt(v, 10);
      if (!Number.isInteger(n) || n <= 0 || String(n) !== v.trim()) {
        console.error(`error: --max-call-duration must be a positive integer (seconds), got: ${v}`);
        process.exit(2);
      }
      return n;
    },
  )
  .option("--json", "machine-readable output")
  .action(async (opts) => {
    if (!opts.to || !opts.outboundInstruction) {
      console.error(
        "error: --to and --outbound-instruction are required to place a call. Use `dial call list` to list, `dial call get <id>` to fetch one, or `dial call --help` for usage.",
      );
      process.exit(2);
    }
    process.exit(
      await runCallSend({
        to: opts.to,
        outboundInstruction: opts.outboundInstruction,
        language: opts.language,
        voiceGender: opts.voiceGender,
        transferTo: opts.transferTo,
        idempotencyKey: opts.idempotencyKey,
        fromNumber: opts.fromNumber,
        fromNumberId: opts.fromNumberId,
        maxCallDurationSeconds: opts.maxCallDuration as number | undefined,
        json: !!opts.json,
      }),
    );
  });

call
  .command("list")
  .description("List recent calls on your account. GET /api/v1/calls.")
  .option("--number-id <id>", "filter to a single phone number")
  .option("--direction <dir>", "inbound or outbound")
  .option("--since <iso8601>", "only calls created after this timestamp")
  .option("--json", "machine-readable output")
  .action(async (opts) =>
    process.exit(
      await runCallList({
        numberId: opts.numberId,
        direction: opts.direction,
        since: opts.since,
        json: !!opts.json,
      }),
    ),
  );

call
  .command("get <call-id>")
  .description("Fetch a single call by id. GET /api/v1/calls/<id>.")
  .option("--json", "machine-readable output")
  .action(async (callId: string, opts) =>
    process.exit(await runCallGet({ callId, json: !!opts.json })),
  );

if (!sandbox) {
  const localTarget = program
    .command("local-target")
    .description("Register local fan-out targets the listen daemon delivers events to.")
    .enablePositionalOptions();

  const localTargetAdd = localTarget
    .command("add")
    .description("Register a new local fan-out target (url or cmd).")
    .enablePositionalOptions();

  localTargetAdd
    .command("url <url>")
    .description("Register a loopback HTTP endpoint. The daemon POSTs each event JSON to <url>.")
    .option(
      "--secret <value>",
      "HMAC-SHA256 key. The daemon signs each request body and sends the hex digest.",
    )
    .option(
      "--signature-header <name>",
      "HTTP header for the HMAC signature (defaults to X-Dial-Signature; only used with --secret)",
    )
    .option("--bearer <token>", "static bearer token, sent as `Authorization: Bearer <token>`")
    .option("--timeout <seconds>", "per-attempt timeout (default 5)", parsePositiveInteger)
    .option("--json", "machine-readable output")
    .action(async (url: string, opts) =>
      process.exit(
        await runLocalTargetAddUrl({
          url,
          secret: opts.secret,
          signatureHeader: opts.signatureHeader,
          bearer: opts.bearer,
          timeoutSeconds: opts.timeout as number | undefined,
          json: !!opts.json,
        }),
      ),
    );

  localTargetAdd
    .command("cmd <path> [args...]")
    .description(
      "Register an executable. The daemon spawns it per event with the event JSON as the final positional argument.",
    )
    .option("--timeout <seconds>", "per-attempt timeout (default 5)", parsePositiveInteger)
    .option("--json", "machine-readable output")
    .passThroughOptions(true)
    .action(async (path: string, args: string[], opts) =>
      process.exit(
        await runLocalTargetAddCmd({
          path,
          args: args ?? [],
          timeoutSeconds: opts.timeout as number | undefined,
          json: !!opts.json,
        }),
      ),
    );

  localTarget
    .command("remove <id>")
    .description("Unregister a target by id (URL for url targets, path for cmd targets).")
    .option("--json", "machine-readable output")
    .action(async (id: string, opts) =>
      process.exit(await runLocalTargetRemove({ id, json: !!opts.json })),
    );

  localTarget
    .command("list")
    .description("List the local targets currently registered for fan-out.")
    .option("--json", "machine-readable output")
    .action(async (opts) => process.exit(await runLocalTargetList({ json: !!opts.json })));
}

program
  .command("wait-for <event-type>")
  .description(
    "Wait for the next matching event in the listen log (e.g. call.ended, message.received).",
  )
  .option(
    "-f, --field <name=value>",
    "exact match on a top-level field (repeatable)",
    (v: string, prev: string[] = []) => [...prev, v],
    [] as string[],
  )
  .option(
    "-r, --regex <name=pattern>",
    "regex match on a top-level field (repeatable). Pattern can be /re/flags or a bare RE.",
    (v: string, prev: string[] = []) => [...prev, v],
    [] as string[],
  )
  .option(
    "-t, --timeout <seconds>",
    "timeout in seconds (default 30)",
    (v: string) => parseInt(v, 10),
    30,
  )
  .option("--json", "machine-readable output")
  .action(async (eventType: string, opts) =>
    process.exit(
      await runWaitFor({
        eventType,
        fields: opts.field as string[],
        regexes: opts.regex as string[],
        timeoutSeconds: opts.timeout as number,
        json: !!opts.json,
      }),
    ),
  );

if (!sandbox)
  program
    .command("mcp")
    .description(
      "Run a local stdio MCP server exposing Dial as agent tools (reuses your saved API key).",
    )
    .action(async () => process.exit(await runMcp()));

if (!sandbox)
  program
    .command("update")
    .description("Update the CLI to the latest published version (global npm installs).")
    .option("--json", "machine-readable output")
    .action(async (opts) => process.exit(await runUpdate({ json: !!opts.json })));

if (!sandbox)
  program
    .command("uninstall")
    .description(
      "Remove the listen daemon, agent skills, and all local Dial state, then print how to remove the package.",
    )
    .option("--json", "machine-readable output")
    .action(async (opts) => process.exit(await runUninstall({ json: !!opts.json })));

// In sandbox mode the commands above are never registered, so invoking one
// would otherwise surface commander's generic "unknown command". Intercept the
// disabled verb first and print a message that names sandbox mode + the escape
// hatches, so the agent isn't left guessing.
if (sandbox) {
  const invoked = process.argv.slice(2).find((a) => !a.startsWith("-"));
  if (invoked && (SANDBOX_DISABLED_COMMANDS as readonly string[]).includes(invoked)) {
    console.error(sandboxDisabledMessage(invoked));
    process.exit(2);
  }
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
});
