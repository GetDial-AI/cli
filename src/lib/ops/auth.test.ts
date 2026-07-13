import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../state.ts";
import { resetSandboxCacheForTests } from "../sandbox.ts";
import { maybeAuth, requireFromNumberId } from "./auth.ts";
import { isDialError } from "./errors.ts";

let tmp: string;
let savedSandbox: string | undefined;
describe("ops/auth", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-ops-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
    savedSandbox = process.env.DIAL_SANDBOX;
    process.env.DIAL_SANDBOX = "0"; // force non-sandbox so the not_signed_in throw is deterministic
    resetSandboxCacheForTests();
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (savedSandbox === undefined) delete process.env.DIAL_SANDBOX;
    else process.env.DIAL_SANDBOX = savedSandbox;
    resetSandboxCacheForTests();
  });

  it("maybeAuth throws DialError not_signed_in when no auth and not sandboxed", () => {
    try {
      maybeAuth();
      assert.fail("expected throw");
    } catch (e) {
      assert.ok(isDialError(e) && e.code === "not_signed_in");
    }
  });

  it("requireFromNumberId falls back to auth.phoneNumberId, honors override, else throws", () => {
    writeAuth({ apiKey: "sk_live_x", accountId: "a", email: "e", phoneNumber: null, phoneNumberId: "pn_1" });
    const auth = maybeAuth();
    assert.ok(auth); // signed in → present
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
