import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyRefParamsHeader } from "./api.ts";
import { resetRefParamsCache } from "./ref-params.ts";

const ORIGINAL_ENV = { ...process.env };

describe("applyRefParamsHeader", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cli-apih-"));
    process.env.XDG_DATA_HOME = dir;
    resetRefParamsCache();
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetRefParamsCache();
    rmSync(dir, { recursive: true, force: true });
  });

  function writeRefFile(contents: string) {
    mkdirSync(join(dir, "dial"), { recursive: true });
    writeFileSync(join(dir, "dial", "ref-params.txt"), contents);
  }

  it("adds X-Dial-Ref-Params (base64) when ref-params.txt exists, preserving other headers", () => {
    writeRefFile("utm_source=news\ndial_attribution_id=aid\n");
    const headers = applyRefParamsHeader({ "user-agent": "@getdial/cli/1.2.3" });
    assert.equal(headers["user-agent"], "@getdial/cli/1.2.3");
    assert.ok(headers["x-dial-ref-params"]);
    assert.equal(
      Buffer.from(headers["x-dial-ref-params"], "base64").toString("utf8"),
      "utm_source=news\ndial_attribution_id=aid\n",
    );
  });

  it("adds no header when ref-params.txt is absent", () => {
    const headers = applyRefParamsHeader({ "user-agent": "@getdial/cli/1.2.3" });
    assert.equal("x-dial-ref-params" in headers, false);
  });
});
