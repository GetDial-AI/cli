import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AUTO_UPDATE_EXEMPT_COMMANDS,
  AUTO_UPDATE_INTERVAL_MS,
  detectInstallKind,
  installedVersion,
  npmUpdateCommand,
  recordUpdateAttempt,
  shouldAutoUpdate,
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
        detectInstallKind("/usr/local/lib/node_modules/@getdial/cli/dist/cli.js"),
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
    const globalScript = "/usr/local/lib/node_modules/@getdial/cli/dist/cli.js";
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

  it("npmUpdateCommand targets @getdial/cli@latest globally", () => {
    const { command, args } = npmUpdateCommand();
    assert.match(command, /npm/);
    assert.deepEqual(args, ["install", "-g", "@getdial/cli@latest"]);
  });

  it("installedVersion reads the package.json on disk and matches VERSION here", () => {
    assert.equal(installedVersion(), VERSION);
  });
});
