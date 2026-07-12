import { onboard } from "../lib/ops/account.ts";
import { isDialError } from "../lib/ops/errors.ts";
import { readAuth, authFilePath } from "../lib/state.ts";
import { installSkill, isSupportedAgent, SUPPORTED_AGENTS, type AgentName, type InstallResult } from "../lib/skill-install.ts";
import { supervisorAvailability } from "../lib/supervisor/index.ts";

function maskApiKey(key: string): string {
  return key.length >= 4 ? `sk_live_***${key.slice(-4)}` : "sk_live_***";
}

export type OnboardOptions = {
  verificationId?: string;
  code?: string;
  inboundInstruction?: string;
  agents?: string[];
  json?: boolean;
};

// Install skills for each requested agent — mirrors the loop inside
// `onboard()` in ops/account.ts. Used by the signed-in-only branch below,
// which skips OTP verification entirely.
function installAgentSkills(agents: string[]): Array<InstallResult | { agent: string; error: string }> {
  const skills: Array<InstallResult | { agent: string; error: string }> = [];
  for (const requested of agents) {
    if (!isSupportedAgent(requested)) {
      skills.push({ agent: requested, error: `unknown agent "${requested}". Supported: ${SUPPORTED_AGENTS.join(", ")}.` });
      continue;
    }
    try {
      skills.push(installSkill(requested as AgentName));
    } catch (err) {
      skills.push({ agent: requested, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return skills;
}

const LISTEN_QUESTION = "Install the background notification listening service?";
const LISTEN_RATIONALE =
  "The background notification listening service runs on this machine and listens for notifications from Dial — SMS arrivals (2FA codes, replies) and call-ended notifications — so the agent on this machine learns about them in real time. " +
  "Without it the agent is send-only: it can place outbound calls and send messages, but it has no way to know when something arrives at your Dial number. " +
  "It can always be installed later with `dial listen install`.";
const PRESENTATION_HINT =
  "When you ask the user, describe it as \"the background notification listening service.\" Don't expose technical details (launchd, plists, daemons, systemd units) — that's not how to talk about it to a non-technical user.";
const FINALIZATION_HINT =
  "To finalize onboarding, ask the user this question before continuing with any other task. If the user's original request was something else (e.g. \"call X\", \"send Y\"), briefly pause that task, ask the question, get an answer, then resume.";

export async function runOnboard(opts: OnboardOptions): Promise<number> {
  // Skill-install-only branch: when --code isn't supplied, we can't (and shouldn't)
  // re-verify — but if the machine is already signed in, the useful thing to do
  // is just install any --agent skills the caller asked for. This is what agents
  // following the docs on an already-onboarded account hit when they read the
  // integration page: signup is a no-op, all that's left is the skill drop-in.
  if (!opts.code) {
    const auth = readAuth();
    if (!auth) {
      const message = "Not signed in. Run `dial signup <email>` first, then re-run with --code from your inbox.";
      if (opts.json) console.log(JSON.stringify({ ok: false, code: "not_signed_in", error: message }));
      else console.error(message);
      return 1;
    }
    const skills = installAgentSkills(opts.agents ?? []);
    const supervisor = supervisorAvailability();
    if (opts.json) {
      console.log(JSON.stringify({
        ok: true,
        alreadySignedIn: true,
        apiKeyFingerprint: auth.apiKey.slice(-4),
        apiKeyMasked: maskApiKey(auth.apiKey),
        apiKeyPath: authFilePath(),
        accountId: auth.accountId,
        phoneNumber: auth.phoneNumber ?? null,
        phoneNumberId: auth.phoneNumberId ?? null,
        listen: { installed: false, autoInstalled: false, canInstall: supervisor.available, unavailableReason: supervisor.available ? null : supervisor.reason },
        skills,
        agentHint: { action: "skip", kind: "already_signed_in", note: "Account is already signed in; verification was skipped and only the requested --agent skills were installed." },
      }));
    } else {
      console.log(`already signed in as ${auth.email || "(unknown email)"} — skipped verification.`);
      console.log(`  api key: ${maskApiKey(auth.apiKey)}   (saved at ${authFilePath()})`);
      for (const r of skills) {
        if ("error" in r) console.log(`  skill (${r.agent}):  failed — ${r.error}`);
        else if (r.written) console.log(`  skill (${r.agent}):  installed → ${r.path}`);
        else if (r.unchanged) console.log(`  skill (${r.agent}):  already up to date → ${r.path}`);
      }
    }
    return 0;
  }
  let result;
  try {
    result = await onboard({
      verificationId: opts.verificationId,
      code: opts.code,
      inboundInstruction: opts.inboundInstruction,
      agents: opts.agents,
    });
  } catch (e) {
    if (!isDialError(e)) throw e;
    if (e.code === "no_pending_signup") {
      if (opts.json) console.log(JSON.stringify({ ok: false, code: "no_pending_signup" }));
      else console.error(e.message);
      return 1;
    }
    if (e.code === "verify_failed") {
      if (opts.json) console.log(JSON.stringify({ ok: false, code: "verify_failed", status: e.status, error: e.message }));
      else console.error(`onboard failed: ${e.message}`);
      return e.status === 401 ? 1 : 2;
    }
    // missing_api_key
    if (opts.json) console.log(JSON.stringify({ ok: false, code: "missing_api_key", error: e.message }));
    else console.error(`onboard failed: ${e.message}`);
    return 2;
  }

  const { apiKey, accountId, phoneNumber, phoneNumberId, apiKeyPath, skills, supervisor } = result;
  const masked = maskApiKey(apiKey);

  if (opts.json) {
    console.log(JSON.stringify({
      ok: true,
      apiKeyFingerprint: apiKey.slice(-4),
      apiKeyMasked: masked,
      apiKeyPath,
      accountId,
      phoneNumber,
      phoneNumberId,
      listen: {
        installed: false,
        autoInstalled: false,
        canInstall: supervisor.available,
        unavailableReason: supervisor.available ? null : supervisor.reason,
      },
      skills,
      agentHint: supervisor.available
        ? {
            action: "ask_user",
            kind: "onboarding_finalization",
            question: LISTEN_QUESTION,
            rationale: LISTEN_RATIONALE,
            presentation: PRESENTATION_HINT,
            finalizationNote: FINALIZATION_HINT,
            useStructuredToolIfAvailable: true,
            onYes: "dial listen install",
            onNo: null,
          }
        : {
            action: "skip",
            kind: "listen_install_unavailable",
            reason: supervisor.reason,
            note: "No user-level service supervisor on this machine (sandbox/container/CI). Skip the install offer and continue with the original task. Inbound events are still reachable via `dial wait-for` (long-poll); only the always-on background listener and `dial local-target` fan-out are unavailable here.",
          },
    }));
  } else {
    console.log("onboarded.");
    console.log(`  api key:      ${masked}   (saved to ${apiKeyPath})`);
    if (phoneNumber) console.log(`  phone number: ${phoneNumber}`);
    for (const r of skills) {
      if ("error" in r) {
        console.log(`  skill (${r.agent}):  failed — ${r.error}`);
      } else if (r.written) {
        console.log(`  skill (${r.agent}):  installed → ${r.path}`);
      } else if (r.unchanged) {
        console.log(`  skill (${r.agent}):  already up to date → ${r.path}`);
      }
    }
    console.log(``);
    if (!supervisor.available) {
      console.log(`listen service: not available on this machine (${supervisor.reason}).`);
      console.log(`Skipping the install offer. Inbound events still work via \`dial wait-for\` (long-poll);`);
      console.log(`only the always-on background listener and \`dial local-target\` fan-out are unavailable here.`);
      return 0;
    }
    console.log(`Onboarding finalization (required):`);
    console.log(``);
    console.log(FINALIZATION_HINT);
    console.log(``);
    console.log(`Ask the user:`);
    console.log(``);
    console.log(`    "${LISTEN_QUESTION}"`);
    console.log(``);
    console.log(`Background: ${LISTEN_RATIONALE}`);
    console.log(``);
    console.log(`Phrasing rules: ${PRESENTATION_HINT}`);
    console.log(``);
    console.log(`Use your structured ask-user / clarification tool if you have one;`);
    console.log(`otherwise ask in your regular reply and wait for the answer.`);
    console.log(``);
    console.log(`After the user answers:`);
    console.log(`  yes → run \`dial listen install\`, then resume the original task.`);
    console.log(`  no  → resume the original task. They can install later with \`dial listen install\`.`);
  }
  return 0;
}
