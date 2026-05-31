import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addTarget,
  assertLoopbackUrl,
  listTargets,
  LocalTargetError,
  removeTarget,
} from "./local-targets.ts";

let tmp: string;

describe("local-targets", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-local-targets-"));
    process.env.HOME = tmp;
    delete process.env.XDG_CONFIG_HOME;
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns an empty list when the registry is missing", () => {
    assert.deepEqual(listTargets(), []);
  });

  it("accepts every documented loopback host", () => {
    for (const host of ["127.0.0.1", "0.0.0.0", "localhost", "::1"]) {
      const url = host === "::1" ? `http://[${host}]:8787/x` : `http://${host}:8787/x`;
      assert.doesNotThrow(() => assertLoopbackUrl(url), `expected ${url} to validate`);
    }
  });

  it("rejects non-loopback hosts", () => {
    assert.throws(() => assertLoopbackUrl("https://example.com/x"), /loopback/);
  });

  it("rejects non-http schemes", () => {
    assert.throws(() => assertLoopbackUrl("ftp://127.0.0.1/x"), /http/);
  });

  it("rejects malformed urls", () => {
    assert.throws(() => assertLoopbackUrl("not a url"), LocalTargetError);
  });

  it("adds, lists, dedupes, and removes targets", () => {
    addTarget({ kind: "url", url: "http://127.0.0.1:8787/a" });
    addTarget({ kind: "cmd", path: "/usr/local/bin/handler", args: ["--log-level", "info"] });
    // dup add returns added=false and doesn't duplicate the entry
    const second = addTarget({ kind: "url", url: "http://127.0.0.1:8787/a" });
    assert.equal(second.added, false);
    assert.equal(listTargets().length, 2);

    const removed = removeTarget("http://127.0.0.1:8787/a");
    assert.equal(removed.removed, true);
    assert.equal(listTargets().length, 1);
    assert.equal(removeTarget("http://nope").removed, false);
  });

  it("persists secrets to a 0600 file", () => {
    addTarget({
      kind: "url",
      url: "http://127.0.0.1:8787/a",
      secret: "shhh",
      signatureHeader: "X-My-Sig",
      bearer: "tok_123",
      timeoutSeconds: 10,
    });
    const file = join(tmp, ".config/dial/local-targets.json");
    const mode = statSync(file).mode & 0o777;
    assert.equal(mode, 0o600, `expected 0600 perms, got ${mode.toString(8)}`);
    const [t] = listTargets();
    assert.equal(t.kind, "url");
    if (t.kind === "url") {
      assert.equal(t.secret, "shhh");
      assert.equal(t.signatureHeader, "X-My-Sig");
      assert.equal(t.bearer, "tok_123");
      assert.equal(t.timeoutSeconds, 10);
    }
  });
});
