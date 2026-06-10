import { uninstallEverything } from "../lib/ops/uninstall.ts";

export async function runUninstall(opts: { json?: boolean }): Promise<number> {
  const report = uninstallEverything();

  if (opts.json) {
    console.log(JSON.stringify(report));
    return report.ok ? 0 : 2;
  }

  const daemonLine =
    report.daemon.status === "removed"
      ? "removed"
      : report.daemon.status === "skipped"
        ? `skipped (${report.daemon.reason})`
        : `failed (${report.daemon.reason})`;
  console.log(`listen daemon: ${daemonLine}`);

  const removedSkills = report.skills.filter((s) => s.removed);
  console.log(
    removedSkills.length
      ? `agent skills: removed from ${removedSkills.map((s) => s.agent).join(", ")}`
      : "agent skills: none installed",
  );

  const removedDirs = report.dirs.filter((d) => d.removed);
  console.log(removedDirs.length ? `state dirs: removed ${removedDirs.map((d) => d.path).join(", ")}` : "state dirs: none present");

  for (const e of report.errors) {
    console.error(`error in ${e.step}: ${e.message}`);
  }

  console.log(`\nDial is removed from this machine. Finish with:\n  ${report.hint}`);
  return report.ok ? 0 : 2;
}
