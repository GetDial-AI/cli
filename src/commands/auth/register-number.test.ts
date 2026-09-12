import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMockApi } from "../../test-utils.ts";
import { readAuth } from "../../lib/state.ts";
import { runAuthRegisterNumber } from "./register-number.ts";

/**
 * `dial auth register-number` against a registration whose number is ALREADY
 * verified — a signup interrupted after the texted code was accepted but before
 * the account was created.
 *
 * The command must finish that signup rather than report a failure. Reporting one
 * strands the caller: no text is coming, so waiting for a code is hopeless, and the
 * obvious recovery — start the signup again — returns the same registration in the
 * same state, which is the loop this behaviour exists to break.
 */

const REGISTRATION_ID = "reg_already_verified";
const OWNER_PHONE = "+14155559911";
const DIAL_NUMBER = "+14155550111";

let tmp: string;
let api: { url: string; close: () => Promise<void> };
let saved: { home?: string; apiUrl?: string; sandbox?: string };

/** Capture stdout/stderr so assertions can read what the command actually printed. */
function captureOutput() {
  const out: string[] = [];
  const err: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...a: unknown[]) => void out.push(a.join(" "));
  console.error = (...a: unknown[]) => void err.push(a.join(" "));
  return {
    out,
    err,
    restore: () => {
      console.log = origLog;
      console.error = origError;
    },
  };
}

describe("auth register-number: already-verified number", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-regnum-"));
    saved = {
      home: process.env.HOME,
      apiUrl: process.env.DIAL_API_URL,
      sandbox: process.env.DIAL_SANDBOX,
    };
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
  });

  afterEach(async () => {
    await api?.close();
    if (saved.home === undefined) delete process.env.HOME;
    else process.env.HOME = saved.home;
    if (saved.apiUrl === undefined) delete process.env.DIAL_API_URL;
    else process.env.DIAL_API_URL = saved.apiUrl;
    if (saved.sandbox === undefined) delete process.env.DIAL_SANDBOX;
    else process.env.DIAL_SANDBOX = saved.sandbox;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("finishes the signup instead of failing, and sends NO code", async () => {
    const calls: string[] = [];
    let verifyBody: Record<string, unknown> = {};
    api = await startMockApi((method, url, body) => {
      calls.push(`${method} ${url}`);
      if (url === "/api/v1/auth/register-number") {
        return {
          status: 409,
          json: {
            error: "This phone number is already verified for this sign-up.",
            code: "phone_already_verified",
          },
        };
      }
      if (url === "/api/v1/auth/verify-number") {
        verifyBody = JSON.parse(body || "{}");
        return {
          status: 200,
          json: {
            accountId: "acct_1",
            created: true,
            apiKey: "sk_live_resumed_key",
            phoneNumber: DIAL_NUMBER,
            phoneNumberId: "num_1",
          },
        };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;

    const cap = captureOutput();
    let exitCode: number;
    try {
      exitCode = await runAuthRegisterNumber(OWNER_PHONE, {
        registrationId: REGISTRATION_ID,
        json: true,
      });
    } finally {
      cap.restore();
    }

    assert.equal(exitCode, 0, "the signup completed, so this is a success");
    assert.deepEqual(calls, [
      "POST /api/v1/auth/register-number",
      "POST /api/v1/auth/verify-number",
    ]);
    assert.equal(
      verifyBody.registrationId,
      REGISTRATION_ID,
      "the resume reuses the registration the conflict came from",
    );
    assert.ok(
      !("code" in verifyBody),
      "no invented code is sent — the number is already proven, so there is nothing to check",
    );

    const payload = JSON.parse(cap.out.join("\n"));
    assert.equal(payload.ok, true);
    assert.equal(payload.accountId, "acct_1");
    assert.equal(payload.phoneNumber, DIAL_NUMBER);
    assert.ok(!("apiKey" in payload), "the raw key is never printed, only saved");

    // The point of the whole exercise: the caller now holds a usable key.
    const auth = readAuth();
    assert.equal(auth?.apiKey, "sk_live_resumed_key");
    assert.equal(auth?.accountId, "acct_1");
  });

  it("never tells the caller to start the signup again", async () => {
    api = await startMockApi((_method, url) => {
      if (url === "/api/v1/auth/register-number") {
        return {
          status: 409,
          json: { error: "already verified", code: "phone_already_verified" },
        };
      }
      if (url === "/api/v1/auth/verify-number") {
        return {
          status: 200,
          json: {
            accountId: "acct_2",
            created: true,
            apiKey: "sk_live_k2",
            phoneNumber: DIAL_NUMBER,
            phoneNumberId: "num_2",
          },
        };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;

    const cap = captureOutput();
    try {
      await runAuthRegisterNumber(OWNER_PHONE, { registrationId: REGISTRATION_ID });
    } finally {
      cap.restore();
    }

    const printed = [...cap.out, ...cap.err].join("\n");
    assert.doesNotMatch(printed, /start(ing)? signing up again/i);
    assert.doesNotMatch(printed, /register-number failed/i);
    assert.match(printed, /already verified/i, "it says plainly what happened");
  });

  it("still reports a genuine failure when the resume itself fails", async () => {
    // Provisioning can fail after the conflict; that must surface, not be swallowed
    // by the recovery path.
    api = await startMockApi((_method, url) => {
      if (url === "/api/v1/auth/register-number") {
        return {
          status: 409,
          json: { error: "already verified", code: "phone_already_verified" },
        };
      }
      if (url === "/api/v1/auth/verify-number") {
        return { status: 502, json: { error: "Setup couldn't be completed." } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;

    const cap = captureOutput();
    let exitCode: number;
    try {
      exitCode = await runAuthRegisterNumber(OWNER_PHONE, {
        registrationId: REGISTRATION_ID,
        json: true,
      });
    } finally {
      cap.restore();
    }

    assert.equal(exitCode, 2, "a request failure, not a success");
    const payload = JSON.parse(cap.out.join("\n"));
    assert.equal(payload.ok, false);
    assert.equal(payload.status, 502);
    assert.equal(readAuth(), null, "nothing was saved");
  });

  it("leaves every other conflict alone", async () => {
    // The three terminal conflicts share one deliberately ambiguous message and no
    // code. Those really do mean start over, and must not be auto-resumed.
    const calls: string[] = [];
    api = await startMockApi((method, url) => {
      calls.push(`${method} ${url}`);
      if (url === "/api/v1/auth/register-number") {
        return {
          status: 409,
          json: { error: "This registration can't accept a phone number. Start signing up again." },
        };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;

    const cap = captureOutput();
    let exitCode: number;
    try {
      exitCode = await runAuthRegisterNumber(OWNER_PHONE, {
        registrationId: REGISTRATION_ID,
        json: true,
      });
    } finally {
      cap.restore();
    }

    assert.equal(exitCode, 2);
    assert.deepEqual(calls, ["POST /api/v1/auth/register-number"], "no resume was attempted");
    const payload = JSON.parse(cap.out.join("\n"));
    assert.equal(payload.ok, false);
    assert.equal(payload.code, "register_number_failed");
  });
});
