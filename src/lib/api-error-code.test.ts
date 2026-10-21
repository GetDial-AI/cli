import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startMockApi } from "../test-utils.ts";
import { apiPost } from "./api.ts";

/**
 * The server sends a machine `code` alongside `error` on the failures a client is
 * meant to branch on. The client has to carry it through: without it the only way
 * to tell those failures apart is matching the prose in `error`, which gets
 * reworded and would break silently.
 */

let api: { url: string; close: () => Promise<void> };
let savedApiUrl: string | undefined;

describe("apiPost: machine error codes", () => {
  beforeEach(() => {
    savedApiUrl = process.env.DIAL_API_URL;
  });
  afterEach(async () => {
    await api?.close();
    if (savedApiUrl === undefined) delete process.env.DIAL_API_URL;
    else process.env.DIAL_API_URL = savedApiUrl;
  });

  it("carries the server's code onto the failure result", async () => {
    api = await startMockApi(() => ({
      status: 409,
      json: { error: "This phone number is already verified.", code: "phone_already_verified" },
    }));
    process.env.DIAL_API_URL = api.url;

    const res = await apiPost("/api/v1/auth/register-number", {});
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.status, 409);
    assert.equal(res.code, "phone_already_verified");
    assert.match(res.error, /already verified/);
  });

  it("leaves code absent when the server sends none", async () => {
    api = await startMockApi(() => ({ status: 409, json: { error: "Start signing up again." } }));
    process.env.DIAL_API_URL = api.url;

    const res = await apiPost("/api/v1/auth/register-number", {});
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.code, undefined, "absent, so a branch on it cannot accidentally match");
  });

  it("ignores a non-string code rather than passing it through", async () => {
    // A caller compares the code against a string literal. Handing it a number or
    // an object would silently never match, which is worse than it being absent.
    api = await startMockApi(() => ({ status: 409, json: { error: "nope", code: { a: 1 } } }));
    process.env.DIAL_API_URL = api.url;

    const res = await apiPost("/api/v1/auth/register-number", {});
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.code, undefined);
  });
});
