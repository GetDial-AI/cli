import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  nextSkewState,
  recordListenVersion,
  SKEW_CONFIRM_TICKS,
  type SkewState,
} from "./listen-version.ts";
import { VERSION } from "./version.ts";

let tmp: string;

describe("listen-version", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-listen-version-"));
    process.env.HOME = tmp;
    delete process.env.XDG_STATE_HOME;
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("records the running version, pid, and start time", () => {
    recordListenVersion(new Date("2026-06-10T12:00:00Z"));
    const raw = JSON.parse(
      readFileSync(join(tmp, ".local/state/dial/listen-version.v1.json"), "utf8"),
    );
    assert.equal(raw.version, VERSION);
    assert.equal(raw.pid, process.pid);
    assert.equal(raw.startedAt, "2026-06-10T12:00:00.000Z");
  });

  describe("nextSkewState", () => {
    const fresh: SkewState = { streak: 0 };

    it("stays calm while versions match", () => {
      const d = nextSkewState(fresh, "1.0.0", "1.0.0");
      assert.deepEqual(d, { state: { streak: 0 }, restart: false });
    });

    it("does not restart on a single mismatched tick", () => {
      const d = nextSkewState(fresh, "1.0.0", "1.1.0");
      assert.equal(d.restart, false);
      assert.equal(d.state.streak, 1);
    });

    it("restarts after two consecutive mismatched ticks", () => {
      let d = nextSkewState(fresh, "1.0.0", "1.1.0");
      d = nextSkewState(d.state, "1.0.0", "1.1.0");
      assert.equal(d.restart, true);
      assert.equal(SKEW_CONFIRM_TICKS, 2);
    });

    it("resets the streak when the installed version is unreadable (npm mid-replace)", () => {
      let d = nextSkewState(fresh, "1.0.0", "1.1.0");
      d = nextSkewState(d.state, "1.0.0", null);
      assert.equal(d.restart, false);
      assert.equal(d.state.streak, 0);
      d = nextSkewState(d.state, "1.0.0", "1.1.0");
      assert.equal(d.restart, false);
    });
  });
});
