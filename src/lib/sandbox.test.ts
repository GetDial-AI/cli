import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  isSandbox,
  computeSandbox,
  sentinelPath,
  sandboxDisabledMessage,
  resetSandboxCacheForTests,
} from "./sandbox.ts";

const ENV_KEYS = ["DIAL_SANDBOX", "HTTPS_PROXY", "HOME", "XDG_DATA_HOME", "XDG_RUNTIME_DIR"] as const;

describe("sandbox", () => {
  let tmp: string;
  let saved: Record<string, string | undefined>;
  const origPlatform = process.platform;

  function setPlatform(p: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", { value: p, configurable: true });
  }
  // Force supervisor *unavailable* regardless of host: pretend Linux with no user bus.
  function noSupervisor(): void {
    setPlatform("linux");
    delete process.env.XDG_RUNTIME_DIR;
  }
  // Force supervisor *available* regardless of host.
  function withSupervisor(): void {
    setPlatform("darwin");
  }

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-sandbox-"));
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.HOME = tmp; // dataDir → <tmp>/.local/share/dial
    resetSandboxCacheForTests();
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    setPlatform(origPlatform);
    rmSync(tmp, { recursive: true, force: true });
    resetSandboxCacheForTests();
  });

  describe("DIAL_SANDBOX override", () => {
    for (const v of ["1", "true", "TRUE", " True "]) {
      it(`"${v}" forces sandbox on even when inference would say off`, () => {
        withSupervisor(); // inference → off
        process.env.HTTPS_PROXY = "http://proxy:8080";
        process.env.DIAL_SANDBOX = v;
        assert.equal(computeSandbox().sandbox, true);
      });
    }
    for (const v of ["0", "false", "FALSE", " False "]) {
      it(`"${v}" forces sandbox off even when inference would say on`, () => {
        noSupervisor();
        process.env.HTTPS_PROXY = "http://proxy:8080"; // inference → on
        process.env.DIAL_SANDBOX = v;
        assert.equal(computeSandbox().sandbox, false);
      });
    }
    it("unrecognized value falls through to inference", () => {
      noSupervisor();
      process.env.HTTPS_PROXY = "http://proxy:8080";
      process.env.DIAL_SANDBOX = "maybe";
      assert.equal(computeSandbox().sandbox, true);
    });
  });

  describe("inference", () => {
    it("true when supervisor unavailable + HTTPS_PROXY set + no sentinel", () => {
      noSupervisor();
      process.env.HTTPS_PROXY = "http://proxy:8080";
      const s = computeSandbox();
      assert.equal(s.sandbox, true);
      assert.match(s.reason, /inferred/);
    });
    it("false when a service supervisor is available", () => {
      withSupervisor();
      process.env.HTTPS_PROXY = "http://proxy:8080";
      assert.equal(computeSandbox().sandbox, false);
    });
    it("false when HTTPS_PROXY is unset", () => {
      noSupervisor();
      delete process.env.HTTPS_PROXY;
      assert.equal(computeSandbox().sandbox, false);
    });
    it("false when HTTPS_PROXY is empty", () => {
      noSupervisor();
      process.env.HTTPS_PROXY = "   ";
      assert.equal(computeSandbox().sandbox, false);
    });
    it("false when the .not-sandbox sentinel exists", () => {
      noSupervisor();
      process.env.HTTPS_PROXY = "http://proxy:8080";
      mkdirSync(dirname(sentinelPath()), { recursive: true });
      writeFileSync(sentinelPath(), "");
      assert.equal(computeSandbox().sandbox, false);
    });
    it("treats an inaccessible sentinel path as absent (no crash)", () => {
      noSupervisor();
      process.env.HTTPS_PROXY = "http://proxy:8080";
      // Make the Dial data dir itself a regular file so statting the sentinel
      // underneath it yields ENOTDIR — must be swallowed and treated as absent.
      const dataDir = dirname(sentinelPath());
      mkdirSync(dirname(dataDir), { recursive: true });
      writeFileSync(dataDir, "not a directory");
      assert.equal(computeSandbox().sandbox, true);
    });
  });

  describe("memoization", () => {
    it("computes once per process until reset", () => {
      noSupervisor();
      process.env.HTTPS_PROXY = "http://proxy:8080";
      assert.equal(isSandbox(), true);
      // Flip the environment so a fresh compute would be false…
      withSupervisor();
      delete process.env.HTTPS_PROXY;
      assert.equal(isSandbox(), true); // …but the memoized value stands.
      resetSandboxCacheForTests();
      assert.equal(isSandbox(), false);
    });
  });

  describe("sandboxDisabledMessage", () => {
    it("names the command, sandbox mode, and both escape hatches", () => {
      noSupervisor();
      process.env.HTTPS_PROXY = "http://proxy:8080";
      const msg = sandboxDisabledMessage("onboard");
      assert.match(msg, /'dial onboard'/);
      assert.match(msg, /disabled in sandbox mode/);
      assert.match(msg, /DIAL_SANDBOX=0/);
      assert.ok(msg.includes(sentinelPath()));
    });
  });
});
