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
        ? {
            status: 200,
            json: {
              call: {
                id: "c1",
                from: "+1",
                to: "+2",
                direction: "outbound",
                status: "queued",
                instruction: null,
              },
            },
          }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+1",
      phoneNumberId: "pn_1",
    });
    const call = await placeCall({ to: "+2", outboundInstruction: "hi", language: "en-US" });
    assert.equal(call.id, "c1");
  });

  it("placeCall omits language from the body when not provided (server auto-detects)", async () => {
    let sentBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/calls") {
        sentBody = body;
        return {
          status: 200,
          json: {
            call: {
              id: "c2",
              from: "+1",
              to: "+2",
              direction: "outbound",
              status: "queued",
              instruction: null,
            },
          },
        };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+1",
      phoneNumberId: "pn_1",
    });
    await placeCall({ to: "+2", outboundInstruction: "hi" });
    assert.ok(!("language" in JSON.parse(sentBody)));
  });

  it("placeCall includes transferTo in the body when provided (and omits it otherwise)", async () => {
    const bodies: string[] = [];
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/calls") {
        bodies.push(body);
        return {
          status: 200,
          json: {
            call: {
              id: "c4",
              from: "+1",
              to: "+2",
              direction: "outbound",
              status: "queued",
              instruction: null,
            },
          },
        };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+1",
      phoneNumberId: "pn_1",
    });
    await placeCall({ to: "+2", outboundInstruction: "hi", transferTo: "+13105551212" });
    await placeCall({ to: "+2", outboundInstruction: "hi" });
    assert.equal(JSON.parse(bodies[0]).transferTo, "+13105551212");
    assert.ok(!("transferTo" in JSON.parse(bodies[1])));
  });

  it("placeCall sends the Idempotency-Key header when provided (and omits it otherwise)", async () => {
    const seenKeys: Array<string | string[] | undefined> = [];
    api = await startMockApi((m, u, _body, headers) => {
      if (m === "POST" && u === "/api/v1/calls") {
        seenKeys.push(headers?.["idempotency-key"]);
        return {
          status: 200,
          json: {
            call: {
              id: "c3",
              from: "+1",
              to: "+2",
              direction: "outbound",
              status: "queued",
              instruction: null,
            },
          },
        };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+1",
      phoneNumberId: "pn_1",
    });
    await placeCall({ to: "+2", outboundInstruction: "hi", idempotencyKey: "key-123" });
    await placeCall({ to: "+2", outboundInstruction: "hi" });
    assert.deepEqual(seenKeys, ["key-123", undefined]);
  });

  it("placeCall includes maxCallDurationSeconds in POST body when set", async () => {
    let requestBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/calls") {
        requestBody = body;
        return {
          status: 200,
          json: {
            call: {
              id: "c5",
              from: "+1",
              to: "+2",
              direction: "outbound",
              status: "queued",
              instruction: null,
            },
          },
        };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+1",
      phoneNumberId: "pn_1",
    });
    await placeCall({
      to: "+2",
      outboundInstruction: "hi",
      language: "en-US",
      maxCallDurationSeconds: 120,
    });
    assert.equal(JSON.parse(requestBody).maxCallDurationSeconds, 120);
  });

  it("placeCall omits maxCallDurationSeconds from POST body when not set", async () => {
    let requestBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/calls") {
        requestBody = body;
        return {
          status: 200,
          json: {
            call: {
              id: "c6",
              from: "+1",
              to: "+2",
              direction: "outbound",
              status: "queued",
              instruction: null,
            },
          },
        };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+1",
      phoneNumberId: "pn_1",
    });
    await placeCall({ to: "+2", outboundInstruction: "hi", language: "en-US" });
    assert.ok(!("maxCallDurationSeconds" in JSON.parse(requestBody)));
  });

  it("placeCall sends an explicit fromNumber ref instead of fromNumberId", async () => {
    let requestBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/calls") {
        requestBody = body;
        return {
          status: 200,
          json: {
            call: {
              id: "c7",
              from: "+1",
              to: "+2",
              direction: "outbound",
              status: "queued",
              instruction: null,
            },
          },
        };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+1",
      phoneNumberId: "pn_1",
    });
    await placeCall({ to: "+2", outboundInstruction: "hi", fromNumber: "Support line" });
    const body = JSON.parse(requestBody);
    assert.equal(body.fromNumber, "Support line");
    assert.ok(!("fromNumberId" in body));
  });

  it("placeCall fails fast when both from selectors are given, before any request", async () => {
    let requests = 0;
    api = await startMockApi(() => {
      requests += 1;
      return { status: 200, json: {} };
    });
    process.env.DIAL_API_URL = api.url;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+1",
      phoneNumberId: "pn_1",
    });
    await assert.rejects(
      placeCall({
        to: "+2",
        outboundInstruction: "hi",
        fromNumber: "Support line",
        fromNumberId: "pn_1",
      }),
      (err: unknown) => {
        assert.ok(isDialError(err));
        assert.equal(err.code, "from_number_conflict");
        return true;
      },
    );
    assert.equal(requests, 0);
  });

  it("getCall maps 404 to DialError not_found", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u.startsWith("/api/v1/calls/")
        ? { status: 404, json: { error: "no such call" } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: null,
      phoneNumberId: "pn_1",
    });
    try {
      await getCall("missing");
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "not_found" && e.status === 404);
    }
  });
});
