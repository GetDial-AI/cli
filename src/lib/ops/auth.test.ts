import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../state.ts";
import { requireAuth, requireFromNumberId } from "./auth.ts";
import { isDialError } from "./errors.ts";

let tmp: string;
describe("ops/auth", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-ops-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("requireAuth throws DialError not_signed_in when no auth", () => {
    try {
      requireAuth();
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "not_signed_in");
    }
  });

  it("requireFromNumberId falls back to auth.phoneNumberId, honors override, else throws", () => {
    writeAuth({ apiKey: "sk_live_x", accountId: "a", email: "e", phoneNumber: null, phoneNumberId: "pn_1" });
    const auth = requireAuth();
    assert.equal(requireFromNumberId(auth), "pn_1");
    assert.equal(requireFromNumberId(auth, "pn_override"), "pn_override");
    try {
      requireFromNumberId({ ...auth, phoneNumberId: null });
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "no_from_number");
    }
  });
});
