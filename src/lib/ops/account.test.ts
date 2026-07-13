import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePendingSignup } from "../state.ts";
import { startMockApi } from "../../test-utils.ts";
import { signup, accountStatus } from "./account.ts";
import { isDialError } from "./errors.ts";
import { resetSandboxCacheForTests } from "../sandbox.ts";

let tmp: string;
let api: { url: string; close: () => Promise<void> };

describe("ops/account", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-account-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
  });
  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    delete process.env.DIAL_API_URL;
    delete process.env.DIAL_SANDBOX;
    resetSandboxCacheForTests();
  });

  it("signup throws pending_exists (with data) when a fresh pending exists and no force", async () => {
    writePendingSignup({ verificationId: "v1", email: "x@y.com", createdAt: new Date().toISOString() });
    try {
      await signup({ email: "x@y.com" });
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "pending_exists");
      assert.equal((e as { data?: { verificationId?: string } }).data?.verificationId, "v1");
    }
  });

  it("accountStatus reports nextStep=signup when signed out", async () => {
    api = await startMockApi(() => ({ status: 200, json: { ok: true } }));
    process.env.DIAL_API_URL = api.url;
    const report = await accountStatus();
    assert.equal(report.auth.signedIn, false);
    assert.equal(report.nextStep, "signup");
  });

  it("sandbox doctor: keyless probe succeeds → ready (no local auth needed)", async () => {
    api = await startMockApi(() => ({ status: 200, json: { ok: true } }));
    process.env.DIAL_API_URL = api.url;
    process.env.DIAL_SANDBOX = "1";
    resetSandboxCacheForTests();
    const report = await accountStatus();
    assert.equal(report.sandbox, true);
    assert.equal(report.auth.keyValid, true);
    assert.equal(report.nextStep, "ready");
  });

  it("sandbox doctor: no credential (401) → connect_credential, never signup", async () => {
    api = await startMockApi(() => ({ status: 401, json: { error: "Unauthorized" } }));
    process.env.DIAL_API_URL = api.url;
    process.env.DIAL_SANDBOX = "1";
    resetSandboxCacheForTests();
    const report = await accountStatus();
    assert.equal(report.sandbox, true);
    assert.equal(report.auth.keyValid, false);
    assert.equal(report.nextStep, "connect_credential");
  });
});
