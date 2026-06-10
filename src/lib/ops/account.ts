import { readAuth, readPendingSignup, writePendingSignup, clearPendingSignup, writeAuth, authFilePath } from "../state.ts";
import { apiGet, apiPost, baseUrl, pingBackend } from "../api.ts";
import { supervisorStatus, lastEventAtFromLog, supervisorAvailability, type SupervisorAvailability } from "../supervisor/index.ts";
import { paths } from "../paths.ts";
import { VERSION } from "../version.ts";
import { installSkill, isSupportedAgent, SUPPORTED_AGENTS, type AgentName, type InstallResult } from "../skill-install.ts";
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
  nextStep: "install" | "signup" | "onboard" | "resend_otp" | "install_listen" | "ready";
};

export async function accountStatus(): Promise<DoctorReport> {
  const ping = await pingBackend();
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
    listenState = { installed: s.installed, running: s.running, lastEventAt: lastEventAtFromLog(paths().listenLog) };
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
    nextStep,
  };
}

// ---- signup ----------------------------------------------------------------

export async function signup(opts: { email: string; force?: boolean }): Promise<{ verificationId: string; email: string }> {
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

  const res = await apiPost<{ verificationId: string }>("/api/v1/auth/signup", { email: opts.email });
  if (!res.ok) throw new DialError("signup_failed", res.error, res.status);

  writePendingSignup({ verificationId: res.data.verificationId, email: opts.email, createdAt: new Date().toISOString() });
  return { verificationId: res.data.verificationId, email: opts.email };
}

// ---- onboard ---------------------------------------------------------------

type VerifyResponse = {
  apiKey?: string | null;
  accountId?: string;
  phoneNumber?: string | null;
  phoneNumberId?: string | null;
  message?: string;
};

export type OnboardInput = {
  verificationId?: string;
  code: string;
  inboundInstruction?: string;
  agents?: string[];
};

export type OnboardResult = {
  apiKey: string;
  apiKeyFingerprint: string;
  apiKeyPath: string;
  accountId: string;
  phoneNumber: string | null;
  phoneNumberId: string | null;
  skills: Array<InstallResult | { agent: string; error: string }>;
  supervisor: SupervisorAvailability;
};

export async function onboard(opts: OnboardInput): Promise<OnboardResult> {
  let verificationId = opts.verificationId;
  let email: string | null = null;

  if (!verificationId) {
    const pending = readPendingSignup();
    if (!pending) {
      throw new DialError("no_pending_signup", "No pending signup. Run `dial signup <email>` first, or pass --verification-id.");
    }
    verificationId = pending.verificationId;
    email = pending.email;
  }

  const res = await apiPost<VerifyResponse>("/api/v1/auth/verify", {
    verificationId,
    code: opts.code,
    ...(opts.inboundInstruction ? { inboundInstruction: opts.inboundInstruction } : {}),
  });
  if (!res.ok) throw new DialError("verify_failed", res.error, res.status);

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

  const skills: Array<InstallResult | { agent: string; error: string }> = [];
  for (const requested of opts.agents ?? []) {
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

  return {
    apiKey,
    apiKeyFingerprint: apiKey.slice(-4),
    apiKeyPath: authFilePath(),
    accountId: res.data.accountId,
    phoneNumber: res.data.phoneNumber ?? null,
    phoneNumberId: res.data.phoneNumberId ?? null,
    skills,
    supervisor: supervisorAvailability(),
  };
}
