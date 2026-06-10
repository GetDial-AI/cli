import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uninstallEverything } from "./uninstall.ts";
import { SKILL_NAME, SUPPORTED_AGENTS } from "../skill-install.ts";

let tmp: string;

function plantDialDirs() {
  for (const dir of [".config/dial", ".local/share/dial", ".local/state/dial"]) {
    mkdirSync(join(tmp, dir), { recursive: true });
    writeFileSync(join(tmp, dir, "marker"), "x");
  }
}

describe("ops/uninstall", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-uninstall-"));
    process.env.HOME = tmp;
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_DATA_HOME;
    delete process.env.XDG_STATE_HOME;
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("removes the daemon, installed skills, and all dial dirs", () => {
    plantDialDirs();
    mkdirSync(join(tmp, `.claude/skills/${SKILL_NAME}`), { recursive: true });
    writeFileSync(join(tmp, `.claude/skills/${SKILL_NAME}/SKILL.md`), "skill");

    let daemonUninstalled = false;
    const report = uninstallEverything({
      availability: () => ({ available: true }),
      uninstallDaemon: () => {
        daemonUninstalled = true;
      },
      home: tmp,
      cwd: tmp,
    });

    assert.equal(daemonUninstalled, true);
    assert.equal(report.ok, true);
    assert.equal(report.daemon.status, "removed");
    assert.equal(report.skills.length, SUPPORTED_AGENTS.length);
    const claude = report.skills.find((s) => s.agent === "claude-code");
    assert.equal(claude?.removed, true);
    assert.equal(report.skills.filter((s) => s.removed).length, 1);
    assert.equal(report.dirs.length, 3);
    for (const dir of report.dirs) assert.equal(dir.removed, true);
    assert.equal(existsSync(join(tmp, ".config/dial")), false);
    assert.equal(existsSync(join(tmp, ".local/share/dial")), false);
    assert.equal(existsSync(join(tmp, ".local/state/dial")), false);
    assert.equal(report.hint, "npm uninstall -g @getdial/cli");
    assert.deepEqual(report.errors, []);
  });

  it("records skipped with the reason when no supervisor is reachable", () => {
    const report = uninstallEverything({
      availability: () => ({ available: false, reason: "no systemd user bus" }),
      uninstallDaemon: () => {
        throw new Error("must not be called");
      },
      home: tmp,
      cwd: tmp,
    });
    assert.equal(report.daemon.status, "skipped");
    assert.equal(report.daemon.reason, "no systemd user bus");
    assert.equal(report.ok, true);
  });

  it("keeps going when the daemon step fails and reports the error", () => {
    plantDialDirs();
    const report = uninstallEverything({
      availability: () => ({ available: true }),
      uninstallDaemon: () => {
        throw new Error("launchctl exploded");
      },
      home: tmp,
      cwd: tmp,
    });
    assert.equal(report.daemon.status, "failed");
    assert.equal(report.ok, false);
    assert.deepEqual(report.errors, [{ step: "daemon", message: "launchctl exploded" }]);
    assert.equal(existsSync(join(tmp, ".config/dial")), false);
  });

  it("reports dirs that did not exist as not removed", () => {
    const report = uninstallEverything({
      availability: () => ({ available: true }),
      uninstallDaemon: () => {},
      home: tmp,
      cwd: tmp,
    });
    assert.equal(report.ok, true);
    for (const dir of report.dirs) assert.equal(dir.removed, false);
  });
});
