import {
  onboard,
  verifyNumber,
  installAgentSkills,
  type OnboardResult,
  type PendingPhoneResult,
} from "../../lib/ops/account.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { readAuth, readPendingSignup, authFilePath } from "../../lib/state.ts";
import type { InstallResult } from "../../lib/skill-install.ts";
import { supervisorAvailability } from "../../lib/supervisor/index.ts";
import { baseUrl } from "../../lib/api.ts";
import { dashboardHint, dashboardUrl } from "../../lib/dashboard.ts";

/**
 * `dial auth verify-otp` — submit a one-time code.
 *
 * Without `--number` it verifies the EMAIL code from `auth login`; with it, the
 * SMS code from `auth register-number`.
 *
 * The email step has two outcomes, and which side effects run depends on which:
 * skill installation is LOCAL (files, no API key) so it happens either way, while
 * saving the key and offering the listen service need an account and therefore only
 * run once one exists.
 */
export type AuthVerifyOtpOptions = {
  verificationId?: string;
  registrationId?: string;
  code?: string;
  /** Verify the SMS code for a registered phone number instead of the email code. */
  number?: boolean;
  agents?: string[];
  json?: boolean;
};

function maskApiKey(key: string): string {
  return key.length >= 4 ? `sk_live_***${key.slice(-4)}` : "sk_live_***";
}

const LISTEN_QUESTION = "Install the background notification listening service?";
const LISTEN_RATIONALE =
  "The background notification listening service runs on this machine and listens for notifications from Dial — SMS arrivals (2FA codes, replies) and call-ended notifications — so the agent on this machine learns about them in real time. " +
  "Without it the agent is send-only: it can place outbound calls and send messages, but it has no way to know when something arrives at your Dial number. " +
  "It can always be installed later with `dial listen install`.";
const PRESENTATION_HINT =
  "When you ask the user, describe it as \"the background notification listening service.\" Don't expose technical details (launchd, plists, daemons, systemd units) — that's not how to talk about it to a non-technical user.";
const FINALIZATION_HINT =
  'To finalize onboarding, ask the user this question before continuing with any other task. If the user\'s original request was something else (e.g. "call X", "send Y"), briefly pause that task, ask the question, get an answer, then resume.';

const REGISTER_NUMBER_COMMAND = "dial auth register-number <phone>";

function printSkills(skills: Array<InstallResult | { agent: string; error: string }>): void {
  for (const r of skills) {
    if ("error" in r) console.log(`  skill (${r.agent}):  failed — ${r.error}`);
    else if (r.written) console.log(`  skill (${r.agent}):  installed → ${r.path}`);
    else if (r.unchanged) console.log(`  skill (${r.agent}):  already up to date → ${r.path}`);
  }
}

/** The account exists: report the key, the skills, and the listen-service offer. */
function reportOnboarded(result: OnboardResult, json: boolean): number {
  const { apiKey, accountId, phoneNumber, phoneNumberId, apiKeyPath, skills, supervisor } = result;
  const masked = maskApiKey(apiKey);

  if (json) {
    console.log(
      JSON.stringify({
        ok: true,
        apiKeyFingerprint: apiKey.slice(-4),
        apiKeyMasked: masked,
        apiKeyPath,
        accountId,
        email: result.email,
        phoneNumber,
        phoneNumberId,
        dashboardUrl: result.dashboardUrl,
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
      }),
    );
    return 0;
  }

  console.log("onboarded.");
  console.log(`  api key:      ${masked}   (saved to ${apiKeyPath})`);
  if (phoneNumber) console.log(`  phone number: ${phoneNumber}`);
  printSkills(skills);
  // Part of the summary, deliberately above the finalization block so that block
  // stays the last thing an agent reads.
  console.log(dashboardHint(result.dashboardUrl, result.email));
  console.log(``);
  if (!supervisor.available) {
    console.log(`listen service: not available on this machine (${supervisor.reason}).`);
    console.log(
      `Skipping the install offer. Inbound events still work via \`dial wait-for\` (long-poll);`,
    );
    console.log(
      `only the always-on background listener and \`dial local-target\` fan-out are unavailable here.`,
    );
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
  console.log(
    `  no  → resume the original task. They can install later with \`dial listen install\`.`,
  );
  return 0;
}

/** The email is verified but the account still needs a phone number. */
function reportPendingPhone(result: PendingPhoneResult, json: boolean): number {
  if (json) {
    console.log(
      JSON.stringify({
        ok: true,
        pendingPhone: true,
        registrationId: result.registrationId,
        email: result.email,
        skills: result.skills,
        nextCommand: REGISTER_NUMBER_COMMAND,
        agentHint: {
          action: "ask_user",
          kind: "phone_number_required",
          question: "What phone number should this Dial account be registered to?",
          rationale:
            "Creating a Dial account requires a verified phone number as well as a verified email. Dial texts a 6-digit code to the number, and the user reads it back. The number is linked to the account permanently — a number can register only one Dial account — so it should be one the user keeps. It must be able to receive SMS, and a Dial number cannot be used.",
          presentation:
            "Ask for the number in international form including the country code. Don't invent one, and don't reuse a Dial number.",
          useStructuredToolIfAvailable: true,
          onAnswer: REGISTER_NUMBER_COMMAND,
        },
      }),
    );
    return 0;
  }

  console.log("email verified — a phone number is still required.");
  printSkills(result.skills);
  console.log(``);
  console.log(`Creating an account needs a verified phone number as well as a verified email.`);
  console.log(`No API key has been issued yet.`);
  console.log(``);
  console.log(`Ask the user for a phone number that can receive SMS, then run:`);
  console.log(``);
  console.log(`    ${REGISTER_NUMBER_COMMAND}`);
  console.log(``);
  console.log(`That number is linked to the account permanently — a number can register only one`);
  console.log(`Dial account — so use one the user keeps. A Dial number can't be used here.`);
  console.log(``);
  console.log(`Dial texts a 6-digit code to it; then run:`);
  console.log(``);
  console.log(`    dial auth verify-otp --number --code <code>`);
  return 0;
}

/** No --code on a machine that's already signed in: just install the skills. */
function reportAlreadySignedIn(opts: AuthVerifyOtpOptions): number {
  const auth = readAuth();
  if (!auth) {
    const message =
      "Not signed in. Run `dial auth login <email>` first, then re-run with --code from your inbox.";
    if (opts.json)
      console.log(JSON.stringify({ ok: false, code: "not_signed_in", error: message }));
    else console.error(message);
    return 1;
  }
  const skills = installAgentSkills(opts.agents);
  const supervisor = supervisorAvailability();
  if (opts.json) {
    console.log(
      JSON.stringify({
        ok: true,
        alreadySignedIn: true,
        apiKeyFingerprint: auth.apiKey.slice(-4),
        apiKeyMasked: maskApiKey(auth.apiKey),
        apiKeyPath: authFilePath(),
        accountId: auth.accountId,
        email: auth.email || null,
        phoneNumber: auth.phoneNumber ?? null,
        phoneNumberId: auth.phoneNumberId ?? null,
        dashboardUrl: dashboardUrl(baseUrl()),
        listen: {
          installed: false,
          autoInstalled: false,
          canInstall: supervisor.available,
          unavailableReason: supervisor.available ? null : supervisor.reason,
        },
        skills,
        agentHint: {
          action: "skip",
          kind: "already_signed_in",
          note: "Account is already signed in; verification was skipped and only the requested --agent skills were installed.",
        },
      }),
    );
  } else {
    console.log(`already signed in as ${auth.email || "(unknown email)"} — skipped verification.`);
    console.log(`  api key: ${maskApiKey(auth.apiKey)}   (saved at ${authFilePath()})`);
    printSkills(skills);
    console.log(dashboardHint(dashboardUrl(baseUrl()), auth.email || null));
  }
  return 0;
}

function reportFailure(e: unknown, opts: AuthVerifyOtpOptions, label: string): number {
  if (!isDialError(e)) throw e;
  if (e.code === "no_pending_signup" || e.code === "no_pending_registration") {
    if (opts.json) console.log(JSON.stringify({ ok: false, code: e.code, error: e.message }));
    else console.error(e.message);
    return 1;
  }
  if (e.code === "verify_failed") {
    if (opts.json)
      console.log(
        JSON.stringify({ ok: false, code: "verify_failed", status: e.status, error: e.message }),
      );
    else console.error(`${label} failed: ${e.message}`);
    // 401 is a wrong/expired code (the user's problem); anything else is ours.
    return e.status === 401 ? 1 : 2;
  }
  // missing_api_key
  if (opts.json) console.log(JSON.stringify({ ok: false, code: e.code, error: e.message }));
  else console.error(`${label} failed: ${e.message}`);
  return 2;
}

export async function runAuthVerifyOtp(opts: AuthVerifyOtpOptions): Promise<number> {
  // ── SMS code: the step that creates the account ──
  if (opts.number) {
    if (!opts.code) {
      const message = "A --code is required with --number. Check the text message.";
      if (opts.json)
        console.log(JSON.stringify({ ok: false, code: "code_required", error: message }));
      else console.error(message);
      return 1;
    }
    if (!opts.registrationId && !readPendingSignup()?.registrationId) {
      const message = `No phone number awaiting verification. Run \`${REGISTER_NUMBER_COMMAND}\` first.`;
      if (opts.json)
        console.log(JSON.stringify({ ok: false, code: "no_pending_registration", error: message }));
      else console.error(message);
      return 1;
    }
    try {
      const result = await verifyNumber({
        registrationId: opts.registrationId,
        code: opts.code,
        agents: opts.agents,
      });
      return reportOnboarded(result, !!opts.json);
    } catch (e) {
      return reportFailure(e, opts, "verify-otp --number");
    }
  }

  // ── Email code ──
  if (!opts.code) return reportAlreadySignedIn(opts);

  try {
    const result = await onboard({
      verificationId: opts.verificationId,
      code: opts.code,
      agents: opts.agents,
    });
    return result.pendingPhone
      ? reportPendingPhone(result, !!opts.json)
      : reportOnboarded(result, !!opts.json);
  } catch (e) {
    return reportFailure(e, opts, "verify-otp");
  }
}
