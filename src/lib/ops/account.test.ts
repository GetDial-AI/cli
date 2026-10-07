import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePendingSignup } from "../state.ts";
import { startMockApi } from "../../test-utils.ts";
import { signup, accountStatus, onboard } from "./account.ts";
import { dashboardUrl } from "../dashboard.ts";
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
    writePendingSignup({
      verificationId: "v1",
      email: "x@y.com",
      createdAt: new Date().toISOString(),
    });
    try {
      await signup({ email: "x@y.com" });
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "pending_exists");
      assert.equal((e as { data?: { verificationId?: string } }).data?.verificationId, "v1");
    }
  });

  it("signup sends the coupon and returns the credit the server accepted", async () => {
    let sent: unknown;
    api = await startMockApi((method, url, body) => {
      if (method === "POST" && url === "/api/v1/auth/signup") {
        sent = JSON.parse(body);
        return {
          status: 200,
          json: { verificationId: "v9", coupon: { code: "EVENT_CODE", amountCents: 10000 } },
        };
      }
      return null;
    });
    process.env.DIAL_API_URL = api.url;
    const res = await signup({ email: "b@example.com", coupon: "event_code" });
    assert.deepEqual(sent, { email: "b@example.com", coupon: "event_code" });
    assert.deepEqual(res, {
      verificationId: "v9",
      email: "b@example.com",
      coupon: { code: "EVENT_CODE", amountCents: 10000 },
    });
  });

  it("signup without a coupon sends none, and a refused coupon surfaces the server's message", async () => {
    let sent: unknown;
    api = await startMockApi((method, url, body) => {
      if (method !== "POST" || url !== "/api/v1/auth/signup") return null;
      sent = JSON.parse(body);
      return sent && (sent as { coupon?: string }).coupon
        ? { status: 409, json: { error: "This coupon was already used with this email." } }
        : { status: 200, json: { verificationId: "v1" } };
    });
    process.env.DIAL_API_URL = api.url;
    assert.deepEqual(await signup({ email: "a@example.com" }), {
      verificationId: "v1",
      email: "a@example.com",
    });
    assert.deepEqual(sent, { email: "a@example.com" });
    await assert.rejects(
      () => signup({ email: "a@example.com", coupon: "USED", force: true }),
      (e: unknown) => isDialError(e) && e.status === 409 && /already used/.test(e.message),
    );
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

  it("onboard returns the dashboard URL and the pending signup's email", async () => {
    api = await startMockApi(() => ({
      status: 200,
      json: {
        accountId: "acct_1",
        apiKey: "sk_live_abcd",
        phoneNumber: "+15550000000",
        phoneNumberId: "pn_1",
      },
    }));
    process.env.DIAL_API_URL = api.url;
    writePendingSignup({
      verificationId: "v1",
      email: "you@example.com",
      createdAt: new Date().toISOString(),
    });

    const result = await onboard({ code: "123456" });

    // Derived from the base rather than hardcoded, so pointing the CLI at another
    // deployment moves the dashboard with it.
    assert.equal(result.dashboardUrl, dashboardUrl(api.url));
    assert.equal(result.email, "you@example.com");
  });

  it("onboard reports a null email when it never saw the signup address", async () => {
    api = await startMockApi(() => ({
      status: 200,
      json: { accountId: "acct_1", apiKey: "sk_live_abcd", phoneNumber: null, phoneNumberId: null },
    }));
    process.env.DIAL_API_URL = api.url;

    // An explicit --verification-id with no pending signup on this machine: the
    // address lives only in the user's inbox, so the hint must not invent one.
    const result = await onboard({ code: "123456", verificationId: "v-explicit" });

    assert.equal(result.email, null);
    assert.equal(result.dashboardUrl, dashboardUrl(api.url));
  });
});
