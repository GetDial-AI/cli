import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../state.ts";
import { startMockApi } from "../../test-utils.ts";
import { sendMessage, listMessages } from "./messages.ts";
import { isDialError } from "./errors.ts";

let tmp: string;
let api: { url: string; close: () => Promise<void> };

describe("ops/messages", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-messages-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
  });
  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    delete process.env.DIAL_API_URL;
  });

  it("sendMessage posts and returns the message", async () => {
    api = await startMockApi((m, u) =>
      m === "POST" && u === "/api/v1/messages"
        ? { status: 200, json: { message: { id: "m1", from: "+15550000", to: "+15551111", body: "hi", channel: "sms", status: "queued" } } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    writeAuth({ apiKey: "sk", accountId: "a", email: "e", phoneNumber: "+15550000", phoneNumberId: "pn_1" });
    const msg = await sendMessage({ to: "+15551111", body: "hi" });
    assert.equal(msg.id, "m1");
    assert.equal(msg.status, "queued");
  });

  it("sendMessage throws no_from_number when no default and no override", async () => {
    writeAuth({ apiKey: "sk", accountId: "a", email: "e", phoneNumber: null, phoneNumberId: null });
    try {
      await sendMessage({ to: "+15551111", body: "hi" });
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "no_from_number");
    }
  });

  it("listMessages returns the messages array", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u.startsWith("/api/v1/messages")
        ? { status: 200, json: { messages: [{ id: "m1", from: "+1", to: "+2", body: "b", channel: "sms", status: "delivered", direction: "inbound" }] } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    writeAuth({ apiKey: "sk", accountId: "a", email: "e", phoneNumber: null, phoneNumberId: "pn_1" });
    const msgs = await listMessages({ direction: "inbound" });
    assert.equal(msgs.length, 1);
  });
});
