import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
        ? {
            status: 200,
            json: {
              message: {
                id: "m1",
                from: "+15550000",
                to: "+15551111",
                body: "hi",
                channel: "sms",
                status: "queued",
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
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    const msg = await sendMessage({ to: "+15551111", body: "hi" });
    assert.equal(msg.id, "m1");
    assert.equal(msg.status, "queued");
  });

  it("sendMessage sends an explicit fromNumber ref instead of fromNumberId", async () => {
    let seenBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/messages") {
        seenBody = body;
        return {
          status: 201,
          json: {
            message: {
              id: "m9",
              from: "+1",
              to: "+2",
              body: "hi",
              channel: "sms",
              status: "queued",
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
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    await sendMessage({ to: "+15551111", body: "hi", fromNumber: "Support line" });
    const body = JSON.parse(seenBody);
    assert.equal(body.fromNumber, "Support line");
    assert.ok(!("fromNumberId" in body));
  });

  it("sendMessage sends fromNumber as a multipart part for file sends", async () => {
    const filePath = join(tmp, "pic.png");
    writeFileSync(filePath, Buffer.from("png-bytes"));
    let seenBody = "";
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/messages") {
        seenBody = body;
        return {
          status: 201,
          json: {
            message: {
              id: "m10",
              from: "+1",
              to: "+2",
              body: "hi",
              channel: "sms",
              status: "queued",
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
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    await sendMessage({
      to: "+15551111",
      body: "hi",
      fromNumber: "Support line",
      media: [filePath],
    });
    assert.match(seenBody, /name="fromNumber"/);
    assert.ok(!/name="fromNumberId"/.test(seenBody));
  });

  it("sendMessage fails fast when both from selectors are given, before any request", async () => {
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
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    await assert.rejects(
      sendMessage({
        to: "+15551111",
        body: "hi",
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

  it("sendMessage with media URLs only sends JSON with mediaUrls", async () => {
    let seen: { contentType?: string; body?: string } = {};
    api = await startMockApi((m, u, body, headers) => {
      if (m === "POST" && u === "/api/v1/messages") {
        seen = { contentType: String(headers?.["content-type"] ?? ""), body };
        return {
          status: 201,
          json: {
            message: {
              id: "m1",
              from: "+1",
              to: "+2",
              body: "hi",
              channel: "sms",
              status: "queued",
              media: [],
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
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    await sendMessage({ to: "+15551111", body: "hi", media: ["https://cdn.example.com/a.png"] });
    assert.match(seen.contentType ?? "", /application\/json/);
    assert.deepEqual(JSON.parse(seen.body ?? "{}").mediaUrls, ["https://cdn.example.com/a.png"]);
  });

  it("sendMessage with a local file sends multipart with file bytes and mediaUrls parts", async () => {
    const filePath = join(tmp, "pic.png");
    writeFileSync(filePath, Buffer.from("png-bytes"));
    let seen: { contentType?: string; userAgent?: string; body?: string } = {};
    api = await startMockApi((m, u, body, headers) => {
      if (m === "POST" && u === "/api/v1/messages") {
        seen = {
          contentType: String(headers?.["content-type"] ?? ""),
          userAgent: String(headers?.["user-agent"] ?? ""),
          body,
        };
        return {
          status: 201,
          json: {
            message: {
              id: "m1",
              from: "+1",
              to: "+2",
              body: "hi",
              channel: "sms",
              status: "queued",
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
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    await sendMessage({
      to: "+15551111",
      body: "hi",
      media: [filePath, "https://cdn.example.com/b.jpg"],
    });
    assert.match(seen.contentType ?? "", /multipart\/form-data/);
    assert.match(seen.userAgent ?? "", /^@getdial\/cli\//);
    const raw = seen.body ?? "";
    assert.match(raw, /name="media"; filename="pic\.png"/);
    assert.match(raw, /Content-Type: image\/png/);
    assert.match(raw, /png-bytes/);
    assert.match(raw, /name="mediaUrls"/);
    assert.match(raw, /https:\/\/cdn\.example\.com\/b\.jpg/);
    assert.match(raw, /name="fromNumberId"/);
  });

  it("sendMessage omits the body for a media-only send and forwards forceAudioFile (JSON)", async () => {
    let seen: { body?: string } = {};
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/messages") {
        seen = { body };
        return {
          status: 201,
          json: {
            message: {
              id: "m1",
              from: "+1",
              to: "+2",
              body: "",
              channel: "unknown",
              status: "unknown",
              media: [],
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
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    await sendMessage({
      to: "+15551111",
      media: ["https://cdn.example.com/note.m4a"],
      forceAudioFile: true,
    });
    const parsed = JSON.parse(seen.body ?? "{}");
    assert.equal("body" in parsed, false);
    assert.equal(parsed.forceAudioFile, true);
    assert.deepEqual(parsed.mediaUrls, ["https://cdn.example.com/note.m4a"]);
  });

  it("sendMessage carries forceAudioFile as a text part and omits an absent body (multipart)", async () => {
    const filePath = join(tmp, "note.m4a");
    writeFileSync(filePath, Buffer.from("m4a-bytes"));
    let seen: { body?: string } = {};
    api = await startMockApi((m, u, body) => {
      if (m === "POST" && u === "/api/v1/messages") {
        seen = { body };
        return {
          status: 201,
          json: {
            message: {
              id: "m1",
              from: "+1",
              to: "+2",
              body: "",
              channel: "unknown",
              status: "unknown",
              media: [],
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
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    await sendMessage({ to: "+15551111", media: [filePath], forceAudioFile: true });
    const raw = seen.body ?? "";
    assert.match(raw, /name="forceAudioFile"/);
    assert.match(raw, /true/);
    assert.doesNotMatch(raw, /name="body"/);
  });

  it("sendMessage rejects unsupported media file extensions locally", async () => {
    const filePath = join(tmp, "tool.exe");
    writeFileSync(filePath, "MZ");
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    try {
      await sendMessage({ to: "+15551111", body: "hi", media: [filePath] });
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "unsupported_media");
    }
  });

  it("sendMessage rejects more than 10 media items locally", async () => {
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+15550000",
      phoneNumberId: "pn_1",
    });
    try {
      await sendMessage({
        to: "+15551111",
        body: "hi",
        media: Array.from({ length: 11 }, (_, i) => `https://x.test/${i}.png`),
      });
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "too_much_media");
    }
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
        ? {
            status: 200,
            json: {
              messages: [
                {
                  id: "m1",
                  from: "+1",
                  to: "+2",
                  body: "b",
                  channel: "sms",
                  status: "delivered",
                  direction: "inbound",
                },
              ],
            },
          }
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
    const msgs = await listMessages({ direction: "inbound" });
    assert.equal(msgs.length, 1);
  });
});
