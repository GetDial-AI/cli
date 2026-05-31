import { readPendingSignup, clearPendingSignup, writeAuth } from "../lib/state.ts";
import { apiPost } from "../lib/api.ts";
import { paths } from "../lib/paths.ts";
import { installSkill, isSupportedAgent, SUPPORTED_AGENTS, type AgentName, type InstallResult } from "../lib/skill-install.ts";
import { supervisorAvailability } from "../lib/supervisor/index.ts";

function maskApiKey(key: string): string {
  return key.length >= 4 ? `sk_live_***${key.slice(-4)}` : "sk_live_***";
}

type VerifyResponse = {
  apiKey?: string | null;
  accountId?: string;
  phoneNumber?: string | null;
  phoneNumberId?: string | null;
  message?: string;
};

export type OnboardOptions = {
  verificationId?: string;
  code: string;
  agents?: string[];
  json?: boolean;
};

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
  let verificationId = opts.verificationId;
  let email: string | null = null;

  if (!verificationId) {
    const pending = readPendingSignup();
    if (!pending) {
      if (opts.json) console.log(JSON.stringify({ ok: false, code: "no_pending_signup" }));
      else console.error("No pending signup. Run `dial signup <email>` first, or pass --verification-id.");
      return 1;
    }
    verificationId = pending.verificationId;
    email = pending.email;
  }

  const res = await apiPost<VerifyResponse>("/api/v1/auth/verify", { verificationId, code: opts.code });
  if (!res.ok) {
    if (opts.json) console.log(JSON.stringify({ ok: false, code: "verify_failed", status: res.status, error: res.error }));
    else console.error(`onboard failed: ${res.error}`);
    return res.status === 401 ? 1 : 2;
  }

  const apiKey = res.data.apiKey ?? null;
  if (!apiKey || !res.data.accountId) {
    if (opts.json) console.log(JSON.stringify({ ok: false, code: "missing_api_key", error: "backend returned no apiKey" }));
    else console.error("onboard failed: backend returned no apiKey");
    return 2;
  }

  writeAuth({
    apiKey,
    accountId: res.data.accountId,
    email: email ?? "",
    phoneNumber: res.data.phoneNumber ?? null,
    phoneNumberId: res.data.phoneNumberId ?? null,
  });
  clearPendingSignup();

  const authFile = paths().authFile;
  const masked = maskApiKey(apiKey);

  const skillResults: Array<InstallResult | { agent: string; error: string }> = [];
  for (const requested of opts.agents ?? []) {
    if (!isSupportedAgent(requested)) {
      skillResults.push({
        agent: requested,
        error: `unknown agent "${requested}". Supported: ${SUPPORTED_AGENTS.join(", ")}.`,
      });
      continue;
    }
    try {
      skillResults.push(installSkill(requested as AgentName));
    } catch (err) {
      skillResults.push({ agent: requested, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const supervisor = supervisorAvailability();

  if (opts.json) {
    console.log(JSON.stringify({
      ok: true,
      apiKeyFingerprint: apiKey.slice(-4),
      apiKeyMasked: masked,
      apiKeyPath: authFile,
      accountId: res.data.accountId,
      phoneNumber: res.data.phoneNumber ?? null,
      phoneNumberId: res.data.phoneNumberId ?? null,
      listen: {
        installed: false,
        autoInstalled: false,
        canInstall: supervisor.available,
        unavailableReason: supervisor.available ? null : supervisor.reason,
      },
      skills: skillResults,
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
    console.log(`  api key:      ${masked}   (saved to ${authFile})`);
    if (res.data.phoneNumber) console.log(`  phone number: ${res.data.phoneNumber}`);
    for (const r of skillResults) {
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
