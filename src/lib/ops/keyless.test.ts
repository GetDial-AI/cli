import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../state.ts";
import { startMockApi } from "../../test-utils.ts";
import { resetSandboxCacheForTests } from "../sandbox.ts";
import { maybeAuth } from "./auth.ts";
import { getBilling } from "./billing.ts";
import { isDialError } from "./errors.ts";

const BILLING = {
  balanceCents: 0,
  numbersReleaseAt: null,
  subscription: null,
  numbers: [],
  paymentMethods: [],
};

let tmp: string;
let api: { url: string; close: () => Promise<void> };
let savedSandbox: string | undefined;

describe("keyless auth (sandbox mode)", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-keyless-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
    savedSandbox = process.env.DIAL_SANDBOX;
    resetSandboxCacheForTests();
  });
  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    delete process.env.DIAL_API_URL;
    if (savedSandbox === undefined) delete process.env.DIAL_SANDBOX;
    else process.env.DIAL_SANDBOX = savedSandbox;
    resetSandboxCacheForTests();
  });

  it("maybeAuth returns undefined (keyless) when sandboxed with no auth file", () => {
    process.env.DIAL_SANDBOX = "1";
    resetSandboxCacheForTests();
    assert.equal(maybeAuth(), undefined);
  });

  it("maybeAuth still throws not_signed_in when NOT sandboxed and no auth file", () => {
    process.env.DIAL_SANDBOX = "0";
    resetSandboxCacheForTests();
    try {
      maybeAuth();
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "not_signed_in");
    }
  });

  it("sandboxed request omits the Authorization header (proxy injects it)", async () => {
    let seenAuth: string | string[] | undefined = "unset";
    api = await startMockApi((m, u, _b, headers) => {
      if (m === "GET" && u === "/api/v1/billing") {
        seenAuth = headers?.authorization;
        return { status: 200, json: BILLING };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    process.env.DIAL_SANDBOX = "1";
    resetSandboxCacheForTests();

    await getBilling();
    assert.equal(seenAuth, undefined);
  });

  it("non-sandbox request still attaches the saved key", async () => {
    let seenAuth: string | string[] | undefined = "unset";
    api = await startMockApi((m, u, _b, headers) => {
      if (m === "GET" && u === "/api/v1/billing") {
        seenAuth = headers?.authorization;
        return { status: 200, json: BILLING };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    process.env.DIAL_SANDBOX = "0";
    resetSandboxCacheForTests();
    writeAuth({ apiKey: "sk_live_x", accountId: "a", email: "e", phoneNumber: null, phoneNumberId: "pn_1" });

    await getBilling();
    assert.equal(seenAuth, "Bearer sk_live_x");
  });
});
