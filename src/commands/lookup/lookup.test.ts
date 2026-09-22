import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../../lib/state.ts";
import { startMockApi } from "../../test-utils.ts";
import { runLookup } from "./lookup.ts";

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

describe("dial lookup", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-lookup-cmd-"));
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

  it("prints the number and a yes per channel it can reach", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u.startsWith("/api/v1/lookup")
        ? { status: 200, json: { number: "+14155550123", supports: { imessage: true } } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runLookup("+14155550123", { json: false }), 0);
    const out = logged.join("\n");
    assert.match(out, /\+14155550123/);
    assert.match(out, /iMessage\s+yes/);
  });

  it("prints no for a channel that can't reach the number", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u.startsWith("/api/v1/lookup")
        ? { status: 200, json: { number: "+14155550123", supports: { imessage: false } } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runLookup("+14155550123", { json: false }), 0);
    assert.match(logged.join("\n"), /iMessage\s+no/);
  });

  it("sends the number as a query parameter, url-encoded", async () => {
    let seen = "";
    api = await startMockApi((m, u) => {
      if (m !== "GET" || !u.startsWith("/api/v1/lookup")) return undefined;
      seen = u;
      return { status: 200, json: { number: "+14155550123", supports: { imessage: true } } };
    });
    process.env.DIAL_API_URL = api.url;
    auth();

    await runLookup("+14155550123", { json: false });
    // The leading + must survive as %2B; unencoded it decodes to a space server-side.
    assert.match(seen, /\?number=%2B14155550123$/);
  });

  it("prints a channel the API added after this CLI shipped, rather than hiding it", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u.startsWith("/api/v1/lookup")
        ? {
            status: 200,
            json: { number: "+14155550123", supports: { imessage: true, telepathy: false } },
          }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runLookup("+14155550123", { json: false }), 0);
    const out = logged.join("\n");
    assert.match(out, /iMessage\s+yes/);
    // Under its raw key, because reporting an unknown channel beats hiding it.
    assert.match(out, /telepathy\s+no/);
  });

  it("prints both known channels under their labels", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u.startsWith("/api/v1/lookup")
        ? {
            status: 200,
            json: { number: "+14155550123", supports: { imessage: true, whatsapp: false } },
          }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runLookup("+14155550123", { json: false }), 0);
    const out = logged.join("\n");
    assert.match(out, /iMessage\s+yes/);
    assert.match(out, /WhatsApp\s+no/);
  });

  it("a null verdict prints as neither yes nor no", async () => {
    // `null` means Dial did not answer for that channel — for WhatsApp, because the account holds
    // no WhatsApp number of its own. Rendering it as `no` would say the number is unreachable,
    // which is the one thing it does not mean, and a `supported ? "yes" : "no"` does exactly that.
    api = await startMockApi((m, u) =>
      m === "GET" && u.startsWith("/api/v1/lookup")
        ? {
            status: 200,
            json: { number: "+14155550123", supports: { imessage: true, whatsapp: null } },
          }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runLookup("+14155550123", { json: false }), 0);
    const line = logged
      .join("\n")
      .split("\n")
      .find((l) => l.includes("WhatsApp"));
    assert.ok(line, "the WhatsApp channel must still be printed");
    assert.ok(!/\byes\b/.test(line), `a null must not read as yes: ${line}`);
    assert.ok(!/\bno\b/.test(line), `a null must not read as no: ${line}`);
    assert.match(line, /unknown/);
  });

  it("--json round-trips a null verdict rather than coercing it", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u.startsWith("/api/v1/lookup")
        ? {
            status: 200,
            json: { number: "+14155550123", supports: { imessage: true, whatsapp: null } },
          }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runLookup("+14155550123", { json: true }), 0);
    assert.deepEqual(JSON.parse(logged[0]), {
      ok: true,
      number: "+14155550123",
      supports: { imessage: true, whatsapp: null },
    });
  });

  it("--json emits the API shape unchanged", async () => {
    api = await startMockApi((m, u) =>
      m === "GET" && u.startsWith("/api/v1/lookup")
        ? { status: 200, json: { number: "+14155550123", supports: { imessage: true } } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.equal(await runLookup("+14155550123", { json: true }), 0);
    assert.deepEqual(JSON.parse(logged[0]), {
      ok: true,
      number: "+14155550123",
      supports: { imessage: true },
    });
  });

  it("exits non-zero on a failed lookup rather than reporting no", async () => {
    // The distinction the endpoint exists to preserve: a 502 means we could not
    // find out, which is worth retrying. Printing "no" here would lose that.
    api = await startMockApi((m, u) =>
      m === "GET" && u.startsWith("/api/v1/lookup")
        ? { status: 502, json: { error: "The lookup couldn't be completed.", code: "upstream" } }
        : undefined,
    );
    process.env.DIAL_API_URL = api.url;
    auth();

    assert.notEqual(await runLookup("+14155550123", { json: false }), 0);
    const out = [...logged, ...errored].join("\n");
    assert.ok(!/\bno\b/.test(out), `a failed lookup must not read as a verdict: ${out}`);
  });
});
