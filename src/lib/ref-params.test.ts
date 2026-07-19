import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refParamsHeader, resetRefParamsCache } from "./ref-params.ts";

const ORIGINAL_ENV = { ...process.env };

describe("refParamsHeader", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cli-refp-"));
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

  it("returns the base64 of ref-params.txt when present", () => {
    const contents = "utm_source=news\ndial_attribution_id=aid\n";
    writeRefFile(contents);
    const header = refParamsHeader();
    assert.ok(header);
    assert.equal(Buffer.from(header as string, "base64").toString("utf8"), contents);
  });

  it("returns null when the file is absent", () => {
    assert.equal(refParamsHeader(), null);
  });

  it("caches the first result (does not re-read after the file changes)", () => {
    writeRefFile("utm_source=news\n");
    const first = refParamsHeader();
    rmSync(join(dir, "dial", "ref-params.txt"));
    assert.equal(refParamsHeader(), first, "second call returns the cached value");
  });
});
