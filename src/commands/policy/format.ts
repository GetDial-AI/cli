import type { Policy } from "../../lib/ops/policies.ts";

/** One allow list as `dial policy list` prints it without `--json`. */
export function formatPolicyLine(p: Policy): string {
  const scope = p.scope === "account" ? "all numbers" : `numbers:${p.numberIds.join(",")}`;
  const callers = `${p.entryCount} ${p.entryCount === 1 ? "caller" : "callers"}`;
  return `${p.id}  "${p.name}"  ${scope}  ${p.enabled ? "on" : "off"}  ${callers}  ${p.blockedCallsLast7Days} blocked (7d)`;
}

/** `dial policy get` without `--json`: the summary line, then every caller. */
export function formatPolicyDetail(p: Policy): string {
  const entries = p.entries ?? [];
  const lines = [formatPolicyLine(p)];
  if (entries.length === 0) {
    lines.push(
      p.enabled
        ? "  no callers — every inbound call on the numbers it covers is declined."
        : "  no callers.",
    );
  }
  for (const e of entries) lines.push(e.label ? `  ${e.number}  ${e.label}` : `  ${e.number}`);
  return lines.join("\n");
}
