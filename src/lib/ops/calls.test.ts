import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../state.ts";
import { startMockApi } from "../../test-utils.ts";
import { placeCall, getCall } from "./calls.ts";
import { isDialError } from "./errors.ts";

let tmp: string;
let api: { url: string; close: () => Promise<void> };

describe("ops/calls", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-calls-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
  });
  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    delete process.env.DIAL_API_URL;
  });

  it("placeCall posts and returns the call", async () => {
    api = await startMockApi((m, u) =>
      m === "POST" && u === "/api/v1/calls"
        ? { status: 200, json: { call: { id: "c1", from: "+1", to: "+2", direction: "outbound", status: "queued", instruction: null } } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    writeAuth({ apiKey: "sk", accountId: "a", email: "e", phoneNumber: "+1", phoneNumberId: "pn_1" });
    const call = await placeCall({ to: "+2", outboundInstruction: "hi", language: "en-US" });
    assert.equal(call.id, "c1");
  });

  it("getCall maps 404 to DialError not_found", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u.startsWith("/api/v1/calls/") ? { status: 404, json: { error: "no such call" } } : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    writeAuth({ apiKey: "sk", accountId: "a", email: "e", phoneNumber: null, phoneNumberId: "pn_1" });
    try {
      await getCall("missing");
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "not_found" && e.status === 404);
    }
  });
});
