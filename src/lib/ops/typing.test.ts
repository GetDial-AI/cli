import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../state.ts";
import { startMockApi } from "../../test-utils.ts";
import { setTyping } from "./typing.ts";
import { isDialError } from "./errors.ts";

let tmp: string;
let api: { url: string; close: () => Promise<void> };

describe("ops/typing", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-typing-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
  });
  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    delete process.env.DIAL_API_URL;
  });

  it("setTyping posts the explicit fromNumber ref as-is", async () => {
    let seen: { body?: string } = {};
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/typing") {
        seen = { body };
        return { status: 200, json: { ok: true } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    const result = await setTyping({
      toNumber: "+15551111",
      value: true,
      fromNumber: "Support line",
    });
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(JSON.parse(seen.body ?? "{}"), {
      toNumber: "+15551111",
      value: true,
      fromNumber: "Support line",
    });
  });

  it("setTyping falls back to the saved default phoneNumberId", async () => {
    let seen: { body?: string } = {};
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/typing") {
        seen = { body };
        return { status: 200, json: { ok: true } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    await setTyping({ toNumber: "+15551111", value: false });
    assert.deepEqual(JSON.parse(seen.body ?? "{}"), {
      toNumber: "+15551111",
      value: false,
      fromNumber: "pn_1",
    });
  });

  it("setTyping throws no_from_number when neither an override nor a default exists", async () => {
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+15550000",
      phoneNumberId: null,
    });
    await assert.rejects(setTyping({ toNumber: "+15551111", value: true }), (err: unknown) => {
      assert.ok(isDialError(err));
      assert.equal(err.code, "no_from_number");
      return true;
    });
  });

  it("setTyping maps an API error to a DialError with the response status", async () => {
    api = await startMockApi((m, u) =>
      m === "POST" && u === "/api/v1/typing"
        ? { status: 404, json: { error: "No number matches" } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    await assert.rejects(setTyping({ toNumber: "+15551111", value: true }), (err: unknown) => {
      assert.ok(isDialError(err));
      assert.equal(err.status, 404);
      return true;
    });
  });

  it("setTyping sends a group destination and does NOT inherit the saved default line", async () => {
    let seen: { body?: string } = {};
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/typing") {
        seen = { body };
        return { status: 200, json: { ok: true } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    await setTyping({ groupId: "grp_1", value: true });
    const sent = JSON.parse(seen.body ?? "{}");
    assert.deepEqual(sent, { groupId: "grp_1", value: true });
    // The saved default must not ride along: the server refuses a from-number that
    // disagrees with the group, so inheriting it would turn onboarding into a 400.
    assert.equal("fromNumber" in sent, false);
    assert.equal("toNumber" in sent, false);
  });

  it("setTyping forwards an explicit fromNumber even for a group", async () => {
    let seen: { body?: string } = {};
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/typing") {
        seen = { body };
        return { status: 200, json: { ok: true } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    await setTyping({ groupId: "grp_1", value: false, fromNumber: "+15559999" });
    assert.deepEqual(JSON.parse(seen.body ?? "{}"), {
      groupId: "grp_1",
      value: false,
      fromNumber: "+15559999",
    });
  });
});
