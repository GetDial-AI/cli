import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../../lib/state.ts";
import { startMockApi } from "../../test-utils.ts";
import { runCallGet } from "./get.ts";

let tmp: string;
let api: { url: string; close: () => Promise<void> };
let logged: string[];
const realLog = console.log;

function auth() {
  writeAuth({
    apiKey: "sk",
    accountId: "a",
    email: "e",
    phoneNumber: "+15550000",
    phoneNumberId: "pn_default",
  });
}

function serveCall(call: unknown) {
  return startMockApi((m, u) =>
    m === "GET" && u.startsWith("/api/v1/calls/") ? { status: 200, json: { call } } : undefined,
  );
}

describe("call get: status label and failure reason", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-call-get-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
    logged = [];
    console.log = (...a: unknown[]) => void logged.push(a.join(" "));
  });
  afterEach(async () => {
    console.log = realLog;
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    delete process.env.DIAL_API_URL;
  });

  it("prints status.label rather than [object Object] for the structured status shape", async () => {
    api = await serveCall({
      id: "c1",
      direction: "outbound",
      from: "+1",
      to: "+2",
      duration: 0,
      createdAt: "2026-09-28T00:00:00Z",
      instruction: null,
      status: {
        state: "Terminated",
        terminationType: "failed",
        cancelRequested: false,
        cancelPending: false,
        label: "Failed/Wrong Number",
      },
      failureReason: null,
    });
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runCallGet({ callId: "c1", json: false }), 0);
    const out = logged.join("\n");
    assert.match(out, /status:\s+Failed\/Wrong Number/);
    assert.ok(!out.includes("[object Object]"), `must not print [object Object]: ${out}`);
  });

  it("falls back gracefully for an old plain-string status", async () => {
    api = await serveCall({
      id: "c2",
      direction: "outbound",
      from: "+1",
      to: "+2",
      duration: 12,
      createdAt: "2026-09-28T00:00:00Z",
      instruction: null,
      status: "completed",
    });
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runCallGet({ callId: "c2", json: false }), 0);
    assert.match(logged.join("\n"), /status:\s+completed/);
  });

  it("prints a human failure line for a known failureReason code", async () => {
    api = await serveCall({
      id: "c3",
      direction: "outbound",
      from: "+1",
      to: "+2",
      duration: 0,
      createdAt: "2026-09-28T00:00:00Z",
      instruction: null,
      status: { state: "Terminated", terminationType: "failed", label: "Failed" },
      failureReason: "self_hosted_key_rejected",
    });
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runCallGet({ callId: "c3", json: false }), 0);
    const out = logged.join("\n");
    assert.match(out, /failure:\s+self_hosted_key_rejected — .*Self-Hosted settings/);
  });

  it("prints an unrecognized failureReason code raw, without crashing", async () => {
    api = await serveCall({
      id: "c4",
      direction: "outbound",
      from: "+1",
      to: "+2",
      duration: 0,
      createdAt: "2026-09-28T00:00:00Z",
      instruction: null,
      status: { state: "Terminated", terminationType: "failed", label: "Failed" },
      failureReason: "some_future_reason_code",
    });
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runCallGet({ callId: "c4", json: false }), 0);
    const out = logged.join("\n");
    assert.match(out, /failure:\s+some_future_reason_code/);
    assert.ok(!out.includes("some_future_reason_code —"), `unknown code must print raw: ${out}`);
  });

  it("omits the failure line entirely when failureReason is null", async () => {
    api = await serveCall({
      id: "c5",
      direction: "outbound",
      from: "+1",
      to: "+2",
      duration: 30,
      createdAt: "2026-09-28T00:00:00Z",
      instruction: null,
      status: { state: "Terminated", terminationType: "completed", label: "Completed" },
      failureReason: null,
    });
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runCallGet({ callId: "c5", json: false }), 0);
    assert.ok(!logged.join("\n").includes("failure:"));
  });

  it("--json passes status and failureReason through untouched", async () => {
    const call = {
      id: "c6",
      direction: "outbound",
      from: "+1",
      to: "+2",
      duration: 0,
      createdAt: "2026-09-28T00:00:00Z",
      instruction: null,
      status: {
        state: "Terminated",
        terminationType: "failed",
        cancelRequested: false,
        cancelPending: false,
        label: "Failed/Wrong Number",
      },
      failureReason: "self_hosted_agent_not_found",
    };
    api = await serveCall(call);
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runCallGet({ callId: "c6", json: true }), 0);
    assert.deepEqual(JSON.parse(logged[0]), { ok: true, call });
  });
});
