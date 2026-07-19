import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../state.ts";
import { startMockApi } from "../../test-utils.ts";
import { waitForEvent } from "./events.ts";

let tmp: string;
let api: { url: string; close: () => Promise<void> };

// With no listen daemon running in a fresh HOME, waitForEvent uses the API path.
describe("ops/events", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-events-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: null,
      phoneNumberId: "pn_1",
    });
  });
  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    delete process.env.DIAL_API_URL;
  });

  it("returns the event from the API long-poll", async () => {
    api = await startMockApi((m, u) =>
      m === "POST" && u === "/api/v1/events/wait"
        ? { status: 200, json: { event: { type: "message.received", to: "+1" } } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    const r = await waitForEvent({
      eventType: "message.received",
      fields: ["to=+1"],
      regexes: [],
      timeoutSeconds: 5,
    });
    assert.equal(r.source, "api");
    assert.equal(r.timedOut, false);
    assert.ok(r.line?.includes("message.received"));
  });

  it("times out (source api) when the poll keeps returning 408", async () => {
    api = await startMockApi((m, u) =>
      m === "POST" && u === "/api/v1/events/wait"
        ? { status: 408, json: { error: "timeout" } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    const r = await waitForEvent({
      eventType: "call.ended",
      fields: [],
      regexes: [],
      timeoutSeconds: 1,
    });
    assert.equal(r.timedOut, true);
    assert.equal(r.source, "api");
    assert.equal(r.event, null);
  });
});
