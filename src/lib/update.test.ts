import { EventEmitter } from "node:events";
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  AUTO_UPDATE_EXEMPT_COMMANDS,
  AUTO_UPDATE_INTERVAL_MS,
  detectInstallKind,
  installedVersion,
  npmUpdateCommand,
  recordUpdateAttempt,
  shouldAutoUpdate,
  spawnDetachedUpdate,
  updateCheckDue,
} from "./update.ts";
import { VERSION } from "./version.ts";

let tmp: string;

describe("update", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-update-"));
    process.env.HOME = tmp;
    delete process.env.XDG_STATE_HOME;
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe("detectInstallKind", () => {
    it("flags the npx cache even though it contains node_modules/@getdial/cli", () => {
      assert.equal(
        detectInstallKind("/Users/x/.npm/_npx/abc123/node_modules/@getdial/cli/dist/cli.js"),
        "npx",
      );
    });

    it("flags a global npm install by its package path", () => {
      assert.equal(
        detectInstallKind(join("usr", "local", "lib", "node_modules", "@getdial", "cli", "dist")),
        "global-npm",
      );
    });

    it("flags a source checkout as other", () => {
      assert.equal(detectInstallKind("/Users/x/repos/cli/src/cli.ts"), "other");
    });

    it("flags DIAL_BIN_OVERRIDE as other", () => {
      assert.equal(
        detectInstallKind("/usr/local/lib/node_modules/@getdial/cli/dist/cli.js", "/opt/dial-bin"),
        "other",
      );
    });
  });

  describe("update-check stamp", () => {
    it("is due when no stamp exists", () => {
      assert.equal(updateCheckDue(new Date()), true);
    });

    it("is not due within the hourly interval", () => {
      const now = new Date("2026-06-10T12:00:00Z");
      recordUpdateAttempt(now);
      assert.equal(existsSync(join(tmp, ".local/state/dial/update-check.v1.json")), true);
      assert.equal(updateCheckDue(new Date(now.getTime() + AUTO_UPDATE_INTERVAL_MS - 1)), false);
    });

    it("is due again after the interval elapses", () => {
      const now = new Date("2026-06-10T12:00:00Z");
      recordUpdateAttempt(now);
      assert.equal(updateCheckDue(new Date(now.getTime() + AUTO_UPDATE_INTERVAL_MS + 1)), true);
    });
  });

  describe("shouldAutoUpdate", () => {
    const globalScript = join("usr", "local", "lib", "node_modules", "@getdial", "cli", "dist");
    const base = { command: "doctor", scriptPath: globalScript, env: {}, now: new Date() };

    it("updates an eligible global install", () => {
      assert.equal(shouldAutoUpdate(base), true);
    });

    it("skips exempt commands", () => {
      for (const command of AUTO_UPDATE_EXEMPT_COMMANDS) {
        assert.equal(shouldAutoUpdate({ ...base, command }), false);
      }
    });

    it("skips when DIAL_NO_AUTO_UPDATE=1", () => {
      assert.equal(shouldAutoUpdate({ ...base, env: { DIAL_NO_AUTO_UPDATE: "1" } }), false);
    });

    it("skips npx and checkout installs", () => {
      assert.equal(
        shouldAutoUpdate({
          ...base,
          scriptPath: "/u/.npm/_npx/h/node_modules/@getdial/cli/dist/cli.js",
        }),
        false,
      );
      assert.equal(shouldAutoUpdate({ ...base, scriptPath: "/u/repos/cli/src/cli.ts" }), false);
    });

    it("skips when the stamp is fresh", () => {
      const now = new Date();
      recordUpdateAttempt(now);
      assert.equal(shouldAutoUpdate({ ...base, now }), false);
    });
  });

  describe("npmUpdateCommand", () => {
    it("uses npm.cmd on Windows when npm is not beside node", () => {
      const { command, args } = npmUpdateCommand({
        platform: "win32",
        execPath: join("node", "bin", "node.exe"),
        pathExists: () => false,
      });
      assert.equal(command, "npm.cmd");
      assert.deepEqual(args, ["install", "-g", "@getdial/cli@latest"]);
    });

    it("uses npm on other platforms when npm is not beside node", () => {
      const { command } = npmUpdateCommand({
        platform: "linux",
        execPath: join("node", "bin", "node"),
        pathExists: () => false,
      });
      assert.equal(command, "npm");
    });

    it("prefers the platform-specific npm executable beside node", () => {
      const execPath = join("node", "bin", "node.exe");
      const sibling = join(dirname(execPath), "npm.cmd");
      const { command } = npmUpdateCommand({
        platform: "win32",
        execPath,
        pathExists: (path) => path === sibling,
      });
      assert.equal(command, sibling);
    });
  });

  it("launches npm.cmd through the Windows command processor", () => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = () => {};
    let invocation: unknown[] = [];

    spawnDetachedUpdate({
      platform: "win32",
      spawn: ((...args: unknown[]) => {
        invocation = args;
        return child;
      }) as unknown as typeof import("node:child_process").spawn,
      updateCommand: () => ({
        command: String.raw`C:\Program Files\nodejs\npm.cmd`,
        args: ["install", "-g", "@getdial/cli@latest"],
      }),
    });

    assert.equal(
      invocation[0],
      String.raw`"C:\Program Files\nodejs\npm.cmd" install -g @getdial/cli@latest`,
    );
    const spawnOptions = invocation[1] as {
      detached: boolean;
      shell: boolean;
      stdio: [string, number, number];
    };
    assert.equal(spawnOptions.detached, true);
    assert.equal(spawnOptions.shell, true);
    assert.equal(spawnOptions.stdio[0], "ignore");
    assert.equal(typeof spawnOptions.stdio[1], "number");
    assert.equal(spawnOptions.stdio[1], spawnOptions.stdio[2]);
  });

  it("logs errors emitted asynchronously by the detached update process", () => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = () => {};

    spawnDetachedUpdate({
      spawn: (() => child) as unknown as typeof import("node:child_process").spawn,
      updateCommand: () => ({ command: "missing-npm", args: [] }),
    });

    assert.doesNotThrow(() => child.emit("error", new Error("spawn missing-npm ENOENT")));
    const log = readFileSync(join(tmp, ".local/state/dial/cli.log"), "utf8");
    assert.match(log, /"source":"auto-update"/);
    assert.match(log, /"context":"spawn"/);
    assert.match(log, /spawn missing-npm ENOENT/);
  });

  it("installedVersion reads the package.json on disk and matches VERSION here", () => {
    assert.equal(installedVersion(), VERSION);
  });
});
