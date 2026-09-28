import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../../lib/state.ts";
import { startMockApi } from "../../test-utils.ts";
import { runCallList } from "./list.ts";

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

describe("call list: status label", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-call-list-"));
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
    api = await startMockApi((m, u) =>
      m === "GET" && u.startsWith("/api/v1/calls")
        ? {
            status: 200,
            json: {
              calls: [
                {
                  id: "c1",
                  direction: "outbound",
                  from: "+1",
                  to: "+2",
                  duration: 0,
                  createdAt: "2026-09-28T00:00:00Z",
                  status: {
                    state: "Terminated",
                    terminationType: "failed",
                    label: "Failed/Wrong Number",
                  },
                  failureReason: "self_hosted_unreachable",
                },
              ],
            },
          }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runCallList({ json: false }), 0);
    const out = logged.join("\n");
    assert.match(out, /Failed\/Wrong Number/);
    assert.ok(!out.includes("[object Object]"), `must not print [object Object]: ${out}`);
  });

  it("falls back gracefully for an old plain-string status", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u.startsWith("/api/v1/calls")
        ? {
            status: 200,
            json: {
              calls: [
                {
                  id: "c2",
                  direction: "inbound",
                  from: "+1",
                  to: "+2",
                  duration: 12,
                  createdAt: "2026-09-28T00:00:00Z",
                  status: "completed",
                },
              ],
            },
          }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runCallList({ json: false }), 0);
    assert.match(logged.join("\n"), /completed/);
  });

  it("--json passes failureReason through untouched", async () => {
    const call = {
      id: "c3",
      direction: "outbound",
      from: "+1",
      to: "+2",
      duration: 0,
      createdAt: "2026-09-28T00:00:00Z",
      status: { state: "Terminated", terminationType: "failed", label: "Failed" },
      failureReason: "self_hosted_at_capacity",
    };
    api = await startMockApi((m, u) =>
      m === "GET" && u.startsWith("/api/v1/calls")
        ? { status: 200, json: { calls: [call] } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runCallList({ json: true }), 0);
    assert.deepEqual(JSON.parse(logged[0]), { ok: true, calls: [call] });
  });
});
