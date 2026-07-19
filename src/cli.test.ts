import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SANDBOX_DISABLED_COMMANDS } from "./lib/sandbox.ts";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "cli.ts");

type Run = { status: number | null; stdout: string; stderr: string };

function runCli(args: string[], extraEnv: Record<string, string>): Run {
  const home = mkdtempSync(join(tmpdir(), "dial-cli-home-"));
  try {
    const res = spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: home,
        DIAL_NO_AUTO_UPDATE: "1",
        ...extraEnv,
      },
    });
    return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

// Matches a command's own entry line in commander's help, e.g.
//   "  onboard [options]  ...", "  signup [options] <email>  ...", "  mcp   ...".
// A command name is followed by " [", " <", or the padding gap (2+ spaces);
// wrapped description prose (single-spaced words) must not match.
function listsCommand(help: string, name: string): boolean {
  return new RegExp(`^\\s+${name}(\\s\\[|\\s<|\\s{2,})`, "m").test(help);
}

describe("cli sandbox gating", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.DIAL_SANDBOX;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.DIAL_SANDBOX;
    else process.env.DIAL_SANDBOX = saved;
  });

  describe("sandbox mode (DIAL_SANDBOX=1)", () => {
    it("omits every disabled command from --help", () => {
      const { stdout } = runCli(["--help"], { DIAL_SANDBOX: "1" });
      for (const cmd of SANDBOX_DISABLED_COMMANDS) {
        assert.equal(listsCommand(stdout, cmd), false, `${cmd} should be hidden`);
      }
      // Surviving commands remain listed.
      assert.equal(listsCommand(stdout, "doctor"), true);
      assert.equal(listsCommand(stdout, "message"), true);
      assert.equal(listsCommand(stdout, "call"), true);
    });

    it("prints a sandbox message and exits non-zero for each disabled command", () => {
      for (const cmd of SANDBOX_DISABLED_COMMANDS) {
        const { status, stderr } = runCli([cmd], { DIAL_SANDBOX: "1" });
        assert.equal(status, 2, `${cmd} should exit 2`);
        assert.match(stderr, new RegExp(`'dial ${cmd}'`));
        assert.match(stderr, /disabled in sandbox mode/);
        assert.match(stderr, /DIAL_SANDBOX=0/);
        assert.match(stderr, /\.not-sandbox/);
      }
    });
  });

  describe("normal mode (DIAL_SANDBOX=0)", () => {
    it("lists the otherwise-disabled commands in --help", () => {
      const { stdout } = runCli(["--help"], { DIAL_SANDBOX: "0" });
      for (const cmd of SANDBOX_DISABLED_COMMANDS) {
        assert.equal(listsCommand(stdout, cmd), true, `${cmd} should be visible`);
      }
    });

    it("does not emit the sandbox message when a disabled command is invoked", () => {
      // `onboard` with no pending signup fails normally — but never with the
      // sandbox message.
      const { stderr } = runCli(["onboard"], { DIAL_SANDBOX: "0" });
      assert.doesNotMatch(stderr, /disabled in sandbox mode/);
    });

    it("rejects invalid local-target timeouts", () => {
      for (const args of [
        ["local-target", "add", "url", "http://127.0.0.1:8787/x", "--timeout", "nope"],
        ["local-target", "add", "cmd", "--timeout", "0", "/bin/true"],
      ]) {
        const { status, stderr } = runCli(args, { DIAL_SANDBOX: "0" });
        assert.equal(status, 1);
        assert.match(stderr, /must be a positive integer/);
      }
    });
  });
});
