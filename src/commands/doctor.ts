import { accountStatus, type DoctorReport } from "../lib/ops/account.ts";

export type DoctorOptions = { json?: boolean };

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
  const report = await accountStatus();
  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else console.log(humanRender(report));
  return 0;
}
