import { readPendingSignup, readAuth } from "../lib/state.ts";
import { apiGet, baseUrl, pingBackend } from "../lib/api.ts";
import { supervisorStatus, lastEventAtFromLog } from "../lib/supervisor/index.ts";
import { paths } from "../lib/paths.ts";
import { VERSION } from "../lib/version.ts";

const OTP_EXPIRY_MS = 10 * 60 * 1000;

export type DoctorOptions = { json?: boolean };

type DoctorReport = {
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

async function buildReport(): Promise<DoctorReport> {
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
    nextStep,
  };
}

function humanRender(r: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`dial ${r.cli.version}  (node ${r.cli.node})`);
  lines.push(`backend:     ${r.backend.url}  ${r.backend.reachable ? `reachable${r.backend.latencyMs != null ? ` (${r.backend.latencyMs}ms)` : ""}` : "UNREACHABLE"}`);
  if (r.auth.signedIn) {
    lines.push(`auth:        signed in as ${r.auth.email} (account ${r.auth.accountId}, key sk_live_***${r.auth.apiKeyFingerprint})${r.auth.keyValid === false ? "  [key rejected by backend]" : ""}`);
  } else {
    lines.push(`auth:        not signed in`);
  }
  if (r.pendingOtp.verificationId) {
    lines.push(`pending otp: ${r.pendingOtp.ageSeconds}s old${r.pendingOtp.expired ? " (EXPIRED)" : ""}`);
  } else {
    lines.push(`pending otp: none`);
  }
  lines.push(`listen:      ${r.listen.installed ? (r.listen.running ? "running" : "installed (stopped)") : "not installed"}${r.listen.lastEventAt ? `, last event ${r.listen.lastEventAt}` : ""}`);
  lines.push("");
  lines.push(`next: ${r.nextStep}`);
  return lines.join("\n");
}

export async function runDoctor(opts: DoctorOptions): Promise<number> {
  const report = await buildReport();
  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else console.log(humanRender(report));
  return 0;
}
