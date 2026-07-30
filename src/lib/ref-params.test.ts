import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from "node:fs";
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

  /** Decode a header back to the raw ref-params.txt contents. */
  function decode(header: string | null): string {
    assert.ok(header, "expected a header");
    return Buffer.from(header as string, "base64").toString("utf8");
  }

  function readRefFile(): string {
    return readFileSync(join(dir, "dial", "ref-params.txt"), "utf8");
  }

  it("mints an attribution id when there is no file at all", () => {
    // The `npm install -g @getdial/cli` path: nothing ever wrote ref-params.txt,
    // so before this the CLI sent no header and the machine was invisible.
    const text = decode(refParamsHeader());
    assert.match(text, /^dial_attribution_id=.+$/m);
    // …and it is persisted, so the next process reuses the same id.
    assert.equal(readRefFile(), text);
  });

  it("appends an id to an existing file, preserving the installer's params", () => {
    writeRefFile("utm_source=news\nutm_campaign=spring\n");
    const text = decode(refParamsHeader());
    assert.ok(
      text.startsWith("utm_source=news\nutm_campaign=spring\n"),
      "pre-existing lines survive byte-for-byte",
    );
    assert.match(text, /^dial_attribution_id=.+$/m);
    assert.equal(readRefFile(), text);
  });

  it("never overwrites an id that came from an attributed install (write-once)", () => {
    const original = "utm_source=news\ndial_attribution_id=from-browser\n";
    writeRefFile(original);
    const text = decode(refParamsHeader());
    assert.equal(text, original, "a real browser-originated id must survive untouched");
    assert.equal(readRefFile(), original);
  });

  it("still returns a usable header when the data dir cannot be written", () => {
    // An unwritable dataDir is already-broken territory, but a signup in this
    // same process must still be able to alias, so the id lives on in memory.
    chmodSync(dir, 0o500);
    try {
      const text = decode(refParamsHeader());
      assert.match(text, /^dial_attribution_id=.+$/m);
    } finally {
      chmodSync(dir, 0o700); // let afterEach clean up
    }
  });

  it("caches the first result (does not re-read after the file changes)", () => {
    writeRefFile("utm_source=news\n");
    const first = refParamsHeader();
    rmSync(join(dir, "dial", "ref-params.txt"));
    assert.equal(refParamsHeader(), first, "second call returns the cached value");
  });
});
