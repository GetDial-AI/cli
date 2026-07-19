import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../state.ts";
import { startMockApi } from "../../test-utils.ts";
import { getBilling } from "./billing.ts";
import { isDialError } from "./errors.ts";

let tmp: string;
let api: { url: string; close: () => Promise<void> };

function signIn() {
  writeAuth({
    apiKey: "sk_live_x",
    accountId: "a",
    email: "e",
    phoneNumber: "+15550000",
    phoneNumberId: "pn_1",
  });
}

describe("ops/billing", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-billing-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
  });
  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    delete process.env.DIAL_API_URL;
  });

  it("getBilling returns the billing payload", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u === "/api/v1/billing"
        ? {
            status: 200,
            json: {
              balanceCents: 500,
              numbersReleaseAt: null,
              subscription: null,
              numbers: [{ id: "pn_1", number: "+15550000", mode: "PAYG" }],
              paymentMethods: [
                {
                  id: "pm_1",
                  type: "card",
                  brand: "visa",
                  last4: "4242",
                  expMonth: 4,
                  expYear: 2027,
                  email: null,
                  isDefault: true,
                },
              ],
            },
          }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    signIn();
    const b = await getBilling();
    assert.equal(b.balanceCents, 500);
    assert.equal(b.numbersReleaseAt, null);
    assert.equal(b.subscription, null);
    assert.equal(b.numbers[0].mode, "PAYG");
    assert.equal(b.paymentMethods[0].type, "card");
    assert.equal(b.paymentMethods[0].brand, "visa");
    assert.equal(b.paymentMethods[0].isDefault, true);
  });

  it("getBilling throws billing_failed on a non-2xx response", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u === "/api/v1/billing"
        ? { status: 401, json: { error: "unauthorized" } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    signIn();
    try {
      await getBilling();
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "billing_failed" && e.status === 401);
    }
  });
});
