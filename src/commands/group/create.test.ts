import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../../lib/state.ts";
import { startMockApi } from "../../test-utils.ts";
import { runGroupCreate } from "./create.ts";

let tmp: string;
let api: { url: string; close: () => Promise<void> } | undefined;
let logged: string[];
let errored: string[];
const realLog = console.log;
const realError = console.error;

function auth(phoneNumberId: string | null = "pn_default") {
  writeAuth({ apiKey: "sk", accountId: "a", email: "e", phoneNumber: "+15550000", phoneNumberId });
}

const CREATED = {
  group: {
    id: "grp_new",
    channel: "whatsapp",
    name: "Launch crew",
    createdAt: "2026-10-26T00:00:00Z",
  },
  notAdded: [
    { number: "+15552222", reason: "privacy_restricted" },
    { number: null, reason: "not_added" },
  ],
};

describe("group create", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-group-create-"));
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
    api = undefined;
    delete process.env.DIAL_API_URL;
  });

  it("posts name and participants from the saved default line, and prints who wasn't added", async () => {
    let seenBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/groups") {
        seenBody = body;
        return { status: 201, json: CREATED };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    auth();

    const code = await runGroupCreate({
      name: "Launch crew",
      participant: ["+15551111", "+15552222"],
      json: false,
    });
    assert.equal(code, 0);
    assert.deepEqual(JSON.parse(seenBody), {
      fromNumberId: "pn_default",
      name: "Launch crew",
      participants: ["+15551111", "+15552222"],
    });
    const out = logged.join("\n");
    assert.match(out, /grp_new/);
    assert.match(out, /Launch crew/);
    assert.match(out, /\+15552222.*their privacy settings only let contacts add them/);
    // A participant the line couldn't name still gets a line, never the literal "null".
    assert.match(out, /unknown number.*couldn't be added/);
    assert.ok(!out.includes("null"), `must not print "null": ${out}`);
  });

  it("--channel whatsapp is sent; any other channel is a flag error with no request", async () => {
    let seenBody = "";
    let calls = 0;
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/groups") {
        calls++;
        seenBody = body;
        return { status: 201, json: { ...CREATED, notAdded: [] } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(
      await runGroupCreate({ channel: "whatsapp", name: "Launch crew", participant: ["+15551111"], json: false }),
      0,
    );
    assert.equal(JSON.parse(seenBody).channel, "whatsapp");

    assert.equal(
      await runGroupCreate({ channel: "imessage", name: "Launch crew", participant: ["+15551111"], json: false }),
      2,
    );
    assert.equal(calls, 1);
    assert.match(errored.join("\n"), /--channel/);
  });

  it("--from-number is sent as fromNumber instead of the saved default", async () => {
    let seenBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/groups") {
        seenBody = body;
        return { status: 201, json: { ...CREATED, notAdded: [] } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    auth();

    await runGroupCreate({
      fromNumber: "+15559999",
      name: "Launch crew",
      participant: ["+15551111"],
      json: false,
    });
    const parsed = JSON.parse(seenBody);
    assert.equal(parsed.fromNumber, "+15559999");
    assert.ok(!("fromNumberId" in parsed), "exactly one of fromNumber/fromNumberId is sent");
  });

  it("--json emits the API shape unchanged with ok:true", async () => {
    api = await startMockApi((m, u) =>
      m === "POST" && u === "/api/v1/groups" ? { status: 201, json: CREATED } : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(
      await runGroupCreate({ name: "Launch crew", participant: ["+15551111"], json: true }),
      0,
    );
    assert.deepEqual(JSON.parse(logged[0]), { ok: true, ...CREATED });
  });

  it("surfaces an API error with its status", async () => {
    api = await startMockApi((m, u) =>
      m === "POST" && u === "/api/v1/groups"
        ? {
            status: 504,
            json: {
              error: "The group wasn't confirmed in time. Check List groups before trying again.",
            },
          }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    const code = await runGroupCreate({
      name: "Launch crew",
      participant: ["+15551111"],
      json: true,
    });
    assert.equal(code, 2);
    const out = JSON.parse(logged[0]);
    assert.equal(out.ok, false);
    assert.equal(out.status, 504);
    assert.match(out.message, /wasn't confirmed in time/);
  });

  // --- local validation: refused before any HTTP call ------------------------------
  // No mock API is started, so a request would fail differently than asserted.

  it("refuses a missing name or no participants without calling the API", async () => {
    auth();
    assert.equal(await runGroupCreate({ participant: ["+15551111"], json: false }), 2);
    assert.equal(await runGroupCreate({ name: "  ", participant: ["+15551111"], json: false }), 2);
    assert.equal(await runGroupCreate({ name: "x", participant: [], json: false }), 2);
    assert.match(errored.join("\n"), /--name is required/);
    assert.match(errored.join("\n"), /at least one --participant/);
  });

  it("refuses a name over 100 characters", async () => {
    auth();
    assert.equal(
      await runGroupCreate({ name: "x".repeat(101), participant: ["+15551111"], json: false }),
      2,
    );
    assert.match(errored.join("\n"), /at most 100 characters/);
  });

  it("asks for a from-number when no default line is saved", async () => {
    auth(null);
    const code = await runGroupCreate({ name: "x", participant: ["+15551111"], json: false });
    assert.equal(code, 1);
    assert.match(errored.join("\n"), /--from-number-id/);
  });

  it("refuses both --from-number and --from-number-id", async () => {
    auth();
    const code = await runGroupCreate({
      fromNumber: "+15559999",
      fromNumberId: "pn_x",
      name: "x",
      participant: ["+15551111"],
      json: false,
    });
    assert.equal(code, 2);
    assert.match(errored.join("\n"), /only one of --from-number and --from-number-id/);
  });

  it("--from-number-id is sent as fromNumberId", async () => {
    let seenBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/groups") {
        seenBody = body;
        return { status: 201, json: { ...CREATED, notAdded: [] } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    auth();

    await runGroupCreate({
      fromNumberId: "pn_x",
      name: "x",
      participant: ["+15551111"],
      json: false,
    });
    const parsed = JSON.parse(seenBody);
    assert.equal(parsed.fromNumberId, "pn_x");
    assert.ok(!("fromNumber" in parsed));
  });
});
