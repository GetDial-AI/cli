import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../../lib/state.ts";
import { startMockApi } from "../../test-utils.ts";
import { runGroupList } from "./list.ts";
import { runMessageSend } from "../message/send.ts";
import { runTypingStart } from "../typing/start.ts";
import { runTypingStop } from "../typing/stop.ts";
import { runNumberPurchase } from "../number/purchase.ts";

let tmp: string;
let api: { url: string; close: () => Promise<void> };
let logged: string[];
let errored: string[];
const realLog = console.log;
const realError = console.error;

function auth() {
  writeAuth({
    apiKey: "sk",
    accountId: "a",
    email: "e",
    phoneNumber: "+15550000",
    phoneNumberId: "pn_default",
  });
}

describe("group list and the group/channel flags", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-group-cmd-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
    logged = [];
    errored = [];
    console.log = (...a: unknown[]) => void logged.push(a.join(" "));
    console.error = (...a: unknown[]) => void errored.push(a.join(" "));
  });
  afterEach(async () => {
    console.log = realLog;
    console.error = realError;
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    delete process.env.DIAL_API_URL;
  });

  it("renders ids and names, and a dash for a group nobody could name", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u === "/api/v1/groups"
        ? {
            status: 200,
            json: {
              groups: [
                { id: "grp_1", name: "Planning bday party", createdAt: "2026-09-01T00:00:00Z" },
                { id: "grp_2", name: null, createdAt: "2026-09-02T00:00:00Z" },
              ],
            },
          }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runGroupList({ json: false }), 0);
    const out = logged.join("\n");
    assert.match(out, /grp_1\s+Planning bday party/);
    // Never the literal "null", and never the id standing in for a name.
    assert.ok(!out.includes("null"), `a null name must not print as "null": ${out}`);
    assert.match(out, /grp_2\s+—/);
  });

  it("--json emits the API shape unchanged", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u === "/api/v1/groups"
        ? { status: 200, json: { groups: [{ id: "grp_1", name: null, createdAt: "2026-09-01T00:00:00Z" }] } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runGroupList({ json: true }), 0);
    assert.deepEqual(JSON.parse(logged[0]), {
      ok: true,
      groups: [{ id: "grp_1", name: null, createdAt: "2026-09-01T00:00:00Z" }],
    });
  });

  it("says so plainly when the account is in no groups", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u === "/api/v1/groups" ? { status: 200, json: { groups: [] } } : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runGroupList({ json: false }), 0);
    assert.match(logged.join("\n"), /no groups/);
  });

  // --- local validation: refused before any HTTP call ------------------------------
  //
  // No mock API is started in these, so a request would throw a connection error
  // rather than return the exit code asserted. That is the point: the check has to
  // happen locally, where the caller can be told which flag to fix.

  it("refuses --to together with --group, and neither, without calling the API", async () => {
    auth();
    assert.equal(
      await runMessageSend({ to: "+15551111", group: "grp_1", body: "hi", json: false }),
      2,
    );
    assert.equal(await runMessageSend({ body: "hi", json: false }), 2);
    assert.match(errored.join("\n"), /exactly one of --to and --group/);
  });

  it("refuses a channel that is not imessage or whatsapp", async () => {
    auth();
    assert.equal(
      await runMessageSend({ to: "+15551111", body: "hi", channel: "sms", json: false }),
      2,
    );
    assert.match(errored.join("\n"), /--channel must be one of imessage, whatsapp/);
  });

  it("refuses a bad channel on both typing verbs", async () => {
    auth();
    assert.equal(await runTypingStart({ toNumber: "+15551111", channel: "sms", json: false }), 2);
    assert.equal(await runTypingStop({ toNumber: "+15551111", channel: "sms", json: false }), 2);
    assert.equal(errored.filter((e) => e.includes("--channel must be one of")).length, 2);
  });

  it("refuses --whatsapp without --include-imessage, naming the requirement", async () => {
    auth();
    const code = await runNumberPurchase({
      inboundInstruction: "hi",
      explicitProgrammaticConsent: "consented",
      whatsapp: true,
      json: false,
    });
    assert.equal(code, 2);
    assert.match(errored.join("\n"), /--whatsapp requires --include-imessage/);
  });
});
