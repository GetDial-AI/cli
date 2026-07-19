import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readAuth,
  writeAuth,
  readPendingSignup,
  writePendingSignup,
  clearPendingSignup,
} from "./state.ts";

let tmp: string;

describe("state", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-state-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns null when auth.json is missing", () => {
    assert.equal(readAuth(), null);
  });

  it("writes auth.v1.json with 0600 perms and 0700 parent dir", () => {
    writeAuth({
      apiKey: "sk_live_abc",
      accountId: "acc_1",
      email: "x@y.com",
      phoneNumber: "+15551234",
      phoneNumberId: "pn_1",
    });
    const file = join(tmp, ".local/share/dial/auth.v1.json");
    const dir = join(tmp, ".local/share/dial");
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(statSync(dir).mode & 0o777, 0o700);
    const auth = readAuth();
    assert.equal(auth?.apiKey, "sk_live_abc");
  });

  it("adopts a legacy unversioned auth.json on first read", () => {
    const dir = join(tmp, ".local/share/dial");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(
      join(dir, "auth.json"),
      JSON.stringify({
        apiKey: "sk_live_old",
        accountId: "acc_1",
        email: "x@y.com",
        phoneNumber: null,
        phoneNumberId: null,
      }),
      { mode: 0o600 },
    );
    assert.equal(readAuth()?.apiKey, "sk_live_old");
    assert.equal(statSync(join(dir, "auth.v1.json")).mode & 0o777, 0o600);
    assert.equal(existsSync(join(dir, "auth.json")), false);
  });

  it("refuses to read auth.v1.json with insecure perms", () => {
    writeAuth({
      apiKey: "sk_live_abc",
      accountId: "a",
      email: "x@y",
      phoneNumber: null,
      phoneNumberId: null,
    });
    const file = join(tmp, ".local/share/dial/auth.v1.json");
    chmodSync(file, 0o644);
    assert.throws(() => readAuth(), /insecure permissions/);
  });

  it("writes and reads pending signup", () => {
    writePendingSignup({
      verificationId: "v1",
      email: "x@y.com",
      createdAt: new Date().toISOString(),
    });
    const p = readPendingSignup();
    assert.equal(p?.verificationId, "v1");
    clearPendingSignup();
    assert.equal(readPendingSignup(), null);
  });

  it("returns null on malformed json", () => {
    const file = join(tmp, ".local/share/dial/auth.v1.json");
    mkdirSync(join(tmp, ".local/share/dial"), { recursive: true, mode: 0o700 });
    writeFileSync(file, "{not json", { mode: 0o600 });
    assert.equal(readAuth(), null);
  });
});
