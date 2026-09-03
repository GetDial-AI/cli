import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../state.ts";
import { startMockApi } from "../../test-utils.ts";
import { listGroups } from "./groups.ts";
import { sendMessage, listMessages } from "./messages.ts";

let tmp: string;
let api: { url: string; close: () => Promise<void> };

function auth() {
  writeAuth({
    apiKey: "sk",
    accountId: "a",
    email: "e",
    phoneNumber: "+15550000",
    phoneNumberId: "pn_default",
  });
}

describe("ops/groups", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-groups-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
  });
  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    delete process.env.DIAL_API_URL;
  });

  it("listGroups returns the groups, including one no line could name", async () => {
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

    const groups = await listGroups();
    assert.equal(groups.length, 2);
    assert.equal(groups[0].name, "Planning bday party");
    // A group whose name could not be read is still a group, not an error.
    assert.equal(groups[1].name, null);
  });

  it("a group send carries groupId and does NOT inherit the saved from-number", async () => {
    // The saved default exists to be filled in — but a group already names its line,
    // and the server refuses a from-number that disagrees with the group. Inheriting it
    // would turn the onboarding convenience into a failed send.
    let seenBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/messages") {
        seenBody = body;
        return {
          status: 201,
          json: {
            message: {
              id: "m1",
              from: "+15550000",
              to: null,
              groupId: "grp_1",
              body: "hi",
              channel: "whatsapp",
              status: "unknown",
            },
          },
        };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    auth();

    const msg = await sendMessage({ groupId: "grp_1", body: "hi" });
    const parsed = JSON.parse(seenBody);
    assert.equal(parsed.groupId, "grp_1");
    assert.ok(!("to" in parsed), "to must be absent on a group send");
    assert.ok(!("fromNumberId" in parsed), "the saved default must not be applied to a group send");
    assert.equal(msg.to, null);
    assert.equal(msg.groupId, "grp_1");
  });

  it("an explicit from-number IS forwarded on a group send", async () => {
    // Allowed, and checked server-side against the group's own line — the CLI does not
    // second-guess a line the caller named on purpose.
    let seenBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/messages") {
        seenBody = body;
        return {
          status: 201,
          json: { message: { id: "m2", from: "+1", to: null, groupId: "grp_1", body: "hi", channel: "whatsapp", status: "unknown" } },
        };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    auth();

    await sendMessage({ groupId: "grp_1", body: "hi", fromNumber: "Support line" });
    assert.equal(JSON.parse(seenBody).fromNumber, "Support line");
  });

  it("a channel is sent only when named", async () => {
    const bodies: string[] = [];
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/messages") {
        bodies.push(body);
        return {
          status: 201,
          json: { message: { id: "m3", from: "+1", to: "+2", body: "hi", channel: "whatsapp", status: "unknown" } },
        };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    auth();

    await sendMessage({ to: "+15551111", body: "hi", channel: "whatsapp" });
    await sendMessage({ to: "+15551111", body: "hi" });
    assert.equal(JSON.parse(bodies[0]).channel, "whatsapp");
    // The send schema is strict: an empty channel field would be a 400, not a no-op.
    assert.ok(!("channel" in JSON.parse(bodies[1])), "an unset channel must not be sent");
  });

  it("listMessages puts groupId in the query", async () => {
    let seenUrl = "";
    api = await startMockApi((m, u) => {
      if (m === "GET" && u.startsWith("/api/v1/messages")) {
        seenUrl = u;
        return { status: 200, json: { messages: [] } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    auth();

    await listMessages({ groupId: "grp_1", direction: "inbound" });
    assert.match(seenUrl, /groupId=grp_1/);
    assert.match(seenUrl, /direction=inbound/);
  });
});
