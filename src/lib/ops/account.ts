import {
  readAuth,
  readPendingSignup,
  writePendingSignup,
  clearPendingSignup,
  writeAuth,
  authFilePath,
} from "../state.ts";
import { apiGet, apiPost, baseUrl, pingBackend } from "../api.ts";
import { dashboardUrl } from "../dashboard.ts";
import {
  supervisorStatus,
  lastEventAtFromLog,
  supervisorAvailability,
  type SupervisorAvailability,
} from "../supervisor/index.ts";
import { paths } from "../paths.ts";
import { VERSION } from "../version.ts";
import {
  installSkill,
  isSupportedAgent,
  SUPPORTED_AGENTS,
  type AgentName,
  type InstallResult,
} from "../skill-install.ts";
import { isSandbox } from "../sandbox.ts";
import { DialError } from "./errors.ts";

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const PENDING_FRESH_MS = 10 * 60 * 1000;

// ---- account status (the `doctor` data) -----------------------------------

export type DoctorReport = {
  cli: { version: string; node: string };
  backend: { url: string; reachable: boolean; latencyMs: number | null };
  auth: {
    signedIn: boolean;
    email: string | null;
    accountId: string | null;
    apiKeyPresent: boolean;
    apiKeyFingerprint: string | null;
    keyValid: boolean | null;
  };
  pendingOtp: { verificationId: string | null; ageSeconds: number | null; expired: boolean | null };
  listen: { installed: boolean; running: boolean; lastEventAt: string | null };
  sandbox: boolean;
  nextStep:
    | "install"
    | "signup"
    | "onboard"
    | "resend_otp"
    | "install_listen"
    | "ready"
    | "connect_credential";
};

export async function accountStatus(): Promise<DoctorReport> {
  const ping = await pingBackend();

  if (isSandbox()) {
    // No local auth file in a sandbox — the gateway injects the credential.
    // Probe keyless (the proxy adds the Authorization header) to report whether
    // the credential is actually connected in the vault. Never suggest
    // signup/onboard/listen here — those are disabled in a sandbox.
    const probe = await apiGet<unknown>("/api/v1/account");
    const connected = probe.ok;
    return {
      cli: { version: VERSION, node: process.versions.node },
      backend: { url: baseUrl(), reachable: ping.reachable, latencyMs: ping.latencyMs },
      auth: {
        signedIn: connected,
        email: null,
        accountId: null,
        apiKeyPresent: connected,
        apiKeyFingerprint: null,
        keyValid: connected,
      },
      pendingOtp: { verificationId: null, ageSeconds: null, expired: null },
      listen: { installed: false, running: false, lastEventAt: null },
      sandbox: true,
      nextStep: connected ? "ready" : "connect_credential",
    };
  }

  const auth = readAuth();
  const pending = readPendingSignup();

  let keyValid: boolean | null = null;
  if (auth?.apiKey) {
    const res = await apiGet<unknown>("/api/v1/account", auth.apiKey);
    keyValid = res.ok;
  }

  const pendingAgeMs = pending ? Date.now() - Date.parse(pending.createdAt) : null;
  const pendingExpired = pendingAgeMs == null ? null : pendingAgeMs > OTP_EXPIRY_MS;

  let listenState: DoctorReport["listen"] = { installed: false, running: false, lastEventAt: null };
  try {
    const s = supervisorStatus();
    listenState = {
      installed: s.installed,
      running: s.running,
      lastEventAt: lastEventAtFromLog(paths().listenLog),
    };
  } catch {
    // unsupported platform — leave defaults
  }

  let nextStep: DoctorReport["nextStep"];
  if (!auth) {
    if (pending && pendingExpired === false) nextStep = "onboard";
    else if (pending && pendingExpired) nextStep = "resend_otp";
    else nextStep = "signup";
  } else if (keyValid === false) {
    nextStep = "signup";
  } else if (!listenState.installed || !listenState.running) {
    nextStep = "install_listen";
  } else {
    nextStep = "ready";
  }

  return {
    cli: { version: VERSION, node: process.versions.node },
    backend: { url: baseUrl(), reachable: ping.reachable, latencyMs: ping.latencyMs },
    auth: {
      signedIn: Boolean(auth),
      email: auth?.email ?? null,
      accountId: auth?.accountId ?? null,
      apiKeyPresent: Boolean(auth?.apiKey),
      apiKeyFingerprint: auth?.apiKey ? auth.apiKey.slice(-4) : null,
      keyValid,
    },
    pendingOtp: {
      verificationId: pending?.verificationId ?? null,
      ageSeconds: pendingAgeMs == null ? null : Math.round(pendingAgeMs / 1000),
      expired: pendingExpired,
    },
    listen: listenState,
    sandbox: false,
    nextStep,
  };
}

// ---- signup ----------------------------------------------------------------

export async function signup(opts: {
  email: string;
  force?: boolean;
}): Promise<{ verificationId: string; email: string }> {
  const existing = readPendingSignup();
  if (existing && !opts.force) {
    const age = Date.now() - Date.parse(existing.createdAt);
    if (Number.isFinite(age) && age < PENDING_FRESH_MS) {
      const ageSeconds = Math.round(age / 1000);
      throw new DialError(
        "pending_exists",
        `A pending OTP for ${existing.email} is still fresh (${ageSeconds}s old). Use \`dial onboard --code <code>\` or re-run with --force to start a new one.`,
        undefined,
        { verificationId: existing.verificationId, email: existing.email, ageSeconds },
      );
    }
  }

  const res = await apiPost<{ verificationId: string }>("/api/v1/auth/signup", {
    email: opts.email,
  });
  if (!res.ok) throw new DialError("signup_failed", res.error, res.status);

  writePendingSignup({
    verificationId: res.data.verificationId,
    email: opts.email,
    createdAt: new Date().toISOString(),
  });
  return { verificationId: res.data.verificationId, email: opts.email };
}

// ---- onboard ---------------------------------------------------------------

type VerifyResponse = {
  apiKey?: string | null;
  accountId?: string;
  phoneNumber?: string | null;
  phoneNumberId?: string | null;
  message?: string;
  /** Present INSTEAD of an account when the email is verified but signing up
   *  still needs a verified phone number. */
  registrationId?: string;
};

export type OnboardInput = {
  verificationId?: string;
  code: string;
  agents?: string[];
};

/**
 * The email code was right, but no account exists yet: creating one also requires
 * a verified phone number. Returned instead of an OnboardResult.
 *
 * Skills are still installed at this point — they are a LOCAL side effect needing
 * no API key, and the installed skill is what teaches an agent the remaining
 * steps, so installing it here is what lets the agent finish.
 */
export type PendingPhoneResult = {
  pendingPhone: true;
  registrationId: string;
  email: string | null;
  skills: Array<InstallResult | { agent: string; error: string }>;
};

export type OnboardResult = {
  pendingPhone?: false;
  apiKey: string;
  apiKeyFingerprint: string;
  apiKeyPath: string;
  accountId: string;
  /**
   * The address that signs in to the dashboard. Null when the caller passed an
   * explicit --verification-id and this machine never saw the signup, so the
   * address exists only in the user's inbox.
   */
  email: string | null;
  phoneNumber: string | null;
  phoneNumberId: string | null;
  /** Where to manage the account in a browser, for the closing hint. */
  dashboardUrl: string;
  skills: Array<InstallResult | { agent: string; error: string }>;
  supervisor: SupervisorAvailability;
};

/** Install the Dial skill into each requested agent's config directory. A local
 *  side effect: it writes files and needs no API key, so it runs whether or not
 *  the signup has produced an account yet. */
export function installAgentSkills(
  agents: string[] | undefined,
): Array<InstallResult | { agent: string; error: string }> {
  const skills: Array<InstallResult | { agent: string; error: string }> = [];
  for (const requested of agents ?? []) {
    if (!isSupportedAgent(requested)) {
      skills.push({
        agent: requested,
        error: `unknown agent "${requested}". Supported: ${SUPPORTED_AGENTS.join(", ")}.`,
      });
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

export async function onboard(opts: OnboardInput): Promise<OnboardResult | PendingPhoneResult> {
  let verificationId = opts.verificationId;
  let email: string | null = null;

  if (!verificationId) {
    const pending = readPendingSignup();
    if (!pending) {
      throw new DialError(
        "no_pending_signup",
        "No pending signup. Run `dial signup <email>` first, or pass --verification-id.",
      );
    }
    verificationId = pending.verificationId;
    email = pending.email;
  }

  const res = await apiPost<VerifyResponse>("/api/v1/auth/verify", {
    verificationId,
    code: opts.code,
  });
  if (!res.ok) throw new DialError("verify_failed", res.error, res.status);

  // Two outcomes. A registrationId means the email is verified but the account
  // needs a verified phone number first — no key is issued yet, so the authed side
  // effects (saving it, offering the listen service) have nothing to do.
  if (res.data.registrationId) {
    const pending = readPendingSignup();
    writePendingSignup({
      verificationId,
      email: email ?? pending?.email ?? "",
      createdAt: pending?.createdAt ?? new Date().toISOString(),
      registrationId: res.data.registrationId,
    });
    return {
      pendingPhone: true,
      registrationId: res.data.registrationId,
      email: email ?? pending?.email ?? null,
      skills: installAgentSkills(opts.agents),
    };
  }

  const apiKey = res.data.apiKey ?? null;
  if (!apiKey || !res.data.accountId) {
    throw new DialError("missing_api_key", "backend returned no apiKey");
  }

  writeAuth({
    apiKey,
    accountId: res.data.accountId,
    email: email ?? "",
    phoneNumber: res.data.phoneNumber ?? null,
    phoneNumberId: res.data.phoneNumberId ?? null,
  });
  clearPendingSignup();

  const skills = installAgentSkills(opts.agents);

  return {
    apiKey,
    apiKeyFingerprint: apiKey.slice(-4),
    apiKeyPath: authFilePath(),
    accountId: res.data.accountId,
    email,
    phoneNumber: res.data.phoneNumber ?? null,
    phoneNumberId: res.data.phoneNumberId ?? null,
    dashboardUrl: dashboardUrl(baseUrl()),
    skills,
    supervisor: supervisorAvailability(),
  };
}

// ── Phone verification ───────────────────────────────────────────────────────

/**
 * Send a verification code to the phone number that will own the account.
 *
 * The number is passed through as typed: the server canonicalizes it and returns
 * the E.164 form, which is what we store and display. Deliberately no local
 * validation — libphonenumber throws under the CLI's test loader, and duplicating
 * the rule would only let the two disagree.
 */
export async function registerNumber(opts: {
  registrationId?: string;
  phoneNumber: string;
}): Promise<{ registrationId: string; phoneNumber: string }> {
  const registrationId = opts.registrationId ?? readPendingSignup()?.registrationId;
  if (!registrationId) {
    throw new DialError(
      "no_pending_registration",
      "No signup awaiting a phone number. Run `dial auth login <email>` and `dial auth verify-otp --code <code>` first.",
    );
  }

  const res = await apiPost<{ registrationId: string; phoneNumber: string; status: string }>(
    "/api/v1/auth/register-number",
    { registrationId, phoneNumber: opts.phoneNumber },
  );
  if (!res.ok) throw new DialError("register_number_failed", res.error, res.status);

  const pending = readPendingSignup();
  if (pending) {
    writePendingSignup({ ...pending, registrationId, ownerPhoneNumber: res.data.phoneNumber });
  }
  return { registrationId, phoneNumber: res.data.phoneNumber };
}

/**
 * Submit the SMS code, which creates the account. Same result shape as onboard's
 * account outcome, so both paths finish identically — key saved, skills installed,
 * listen service offered.
 */
export async function verifyNumber(opts: {
  registrationId?: string;
  code: string;
  agents?: string[];
}): Promise<OnboardResult> {
  const pending = readPendingSignup();
  const registrationId = opts.registrationId ?? pending?.registrationId;
  if (!registrationId) {
    throw new DialError(
      "no_pending_registration",
      "No phone number awaiting verification. Run `dial auth register-number <phone>` first.",
    );
  }

  const res = await apiPost<VerifyResponse>("/api/v1/auth/verify-number", {
    registrationId,
    code: opts.code,
  });
  if (!res.ok) throw new DialError("verify_failed", res.error, res.status);

  const apiKey = res.data.apiKey ?? null;
  if (!apiKey || !res.data.accountId) {
    throw new DialError("missing_api_key", "backend returned no apiKey");
  }

  writeAuth({
    apiKey,
    accountId: res.data.accountId,
    email: pending?.email ?? "",
    phoneNumber: res.data.phoneNumber ?? null,
    phoneNumberId: res.data.phoneNumberId ?? null,
  });
  clearPendingSignup();

  return {
    apiKey,
    apiKeyFingerprint: apiKey.slice(-4),
    apiKeyPath: authFilePath(),
    accountId: res.data.accountId,
    email: pending?.email ?? null,
    phoneNumber: res.data.phoneNumber ?? null,
    phoneNumberId: res.data.phoneNumberId ?? null,
    dashboardUrl: dashboardUrl(baseUrl()),
    skills: installAgentSkills(opts.agents),
    supervisor: supervisorAvailability(),
  };
}
