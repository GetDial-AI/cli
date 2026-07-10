import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../state.ts";
import { startMockApi } from "../../test-utils.ts";
import { listNumbers, purchaseNumber, setNumberProperties } from "./numbers.ts";
import { isDialError } from "./errors.ts";

let tmp: string;
let api: { url: string; close: () => Promise<void> };

function signIn() {
  writeAuth({ apiKey: "sk_live_x", accountId: "a", email: "e", phoneNumber: "+15550000", phoneNumberId: "pn_1" });
}

describe("ops/numbers", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-numbers-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
  });
  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    delete process.env.DIAL_API_URL;
  });

  it("listNumbers returns numbers + defaultNumberId from auth", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u === "/api/v1/numbers"
        ? { status: 200, json: { numbers: [{ id: "pn_1", number: "+15550000", country: "US" }] } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    signIn();
    const { numbers, defaultNumberId } = await listNumbers();
    assert.equal(numbers.length, 1);
    assert.equal(defaultNumberId, "pn_1");
  });

  it("setNumberProperties throws number_not_found when E.164 absent", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u === "/api/v1/numbers" ? { status: 200, json: { numbers: [] } } : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    signIn();
    try {
      await setNumberProperties({ number: "+19998887777", inboundInstruction: "x" });
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "number_not_found");
    }
  });

  it("setNumberProperties PATCHes only the provided properties", async () => {
    let patchBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "GET" && u === "/api/v1/numbers")
        return { status: 200, json: { numbers: [{ id: "pn_1", number: "+15550000", country: "US" }] } };
      if (m === "PATCH" && u === "/api/v1/numbers/pn_1") {
        patchBody = body;
        return { status: 200, json: { number: { id: "pn_1", number: "+15550000", country: "US", nickname: "Support line" } } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    signIn();
    const n = await setNumberProperties({ number: "+15550000", nickname: "Support line" });
    assert.deepEqual(JSON.parse(patchBody), { nickname: "Support line" });
    assert.equal(n.nickname, "Support line");
  });

  it("setNumberProperties sends an empty-string nickname (clears it)", async () => {
    let patchBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "GET" && u === "/api/v1/numbers")
        return { status: 200, json: { numbers: [{ id: "pn_1", number: "+15550000", country: "US" }] } };
      if (m === "PATCH" && u === "/api/v1/numbers/pn_1") {
        patchBody = body;
        return { status: 200, json: { number: { id: "pn_1", number: "+15550000", country: "US", nickname: null } } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    signIn();
    const n = await setNumberProperties({ number: "+15550000", nickname: "" });
    assert.deepEqual(JSON.parse(patchBody), { nickname: "" });
    assert.equal(n.nickname, null);
  });

  it("setNumberProperties sends inboundLanguage, mapping an empty string to null (clears it)", async () => {
    let patchBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "GET" && u === "/api/v1/numbers")
        return { status: 200, json: { numbers: [{ id: "pn_1", number: "+15550000", country: "US" }] } };
      if (m === "PATCH" && u === "/api/v1/numbers/pn_1") {
        patchBody = body;
        return { status: 200, json: { number: { id: "pn_1", number: "+15550000", country: "US", inboundLanguage: "es-ES" } } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    signIn();
    const n = await setNumberProperties({ number: "+15550000", inboundLanguage: "es-ES" });
    assert.deepEqual(JSON.parse(patchBody), { inboundLanguage: "es-ES" });
    assert.equal(n.inboundLanguage, "es-ES");
    await setNumberProperties({ number: "+15550000", inboundLanguage: "" });
    assert.deepEqual(JSON.parse(patchBody), { inboundLanguage: null });
  });

  it("setNumberProperties throws bad_request when no properties are given", async () => {
    signIn();
    try {
      await setNumberProperties({ number: "+15550000" });
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "bad_request");
    }
  });

  it("setNumberProperties sends maxCallDurationSeconds when set", async () => {
    let patchBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "GET" && u === "/api/v1/numbers")
        return { status: 200, json: { numbers: [{ id: "pn_1", number: "+15550000", country: "US" }] } };
      if (m === "PATCH" && u === "/api/v1/numbers/pn_1") {
        patchBody = body;
        return { status: 200, json: { number: { id: "pn_1", number: "+15550000", country: "US" } } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    signIn();
    await setNumberProperties({ number: "+15550000", maxCallDurationSeconds: 300 });
    assert.deepEqual(JSON.parse(patchBody), { maxCallDurationSeconds: 300 });
  });

  it("setNumberProperties sends null maxCallDurationSeconds to clear the cap", async () => {
    let patchBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "GET" && u === "/api/v1/numbers")
        return { status: 200, json: { numbers: [{ id: "pn_1", number: "+15550000", country: "US" }] } };
      if (m === "PATCH" && u === "/api/v1/numbers/pn_1") {
        patchBody = body;
        return { status: 200, json: { number: { id: "pn_1", number: "+15550000", country: "US" } } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    signIn();
    await setNumberProperties({ number: "+15550000", maxCallDurationSeconds: null });
    assert.deepEqual(JSON.parse(patchBody), { maxCallDurationSeconds: null });
  });

  it("purchaseNumber throws purchase_failed on non-2xx", async () => {
    api = await startMockApi((m, u) =>
      m === "POST" && u === "/api/v1/numbers" ? { status: 402, json: { error: "payment required" } } : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    signIn();
    try {
      await purchaseNumber({ inboundInstruction: "x" });
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "purchase_failed" && e.status === 402);
    }
  });
});
