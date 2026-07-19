import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendJsonl, rotateIfLarge } from "./log.ts";

let tmp: string;
let file: string;

describe("log", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-log-"));
    file = join(tmp, "x.log");
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("appendJsonl writes a single JSON line per call", () => {
    appendJsonl(file, { a: 1 });
    appendJsonl(file, { a: 2 });
    const lines = readFileSync(file, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]), { a: 1 });
    assert.deepEqual(JSON.parse(lines[1]), { a: 2 });
  });

  it("appendJsonl creates parent dir", () => {
    const nested = join(tmp, "deep/dir/x.log");
    appendJsonl(nested, { ok: true });
    assert.ok(statSync(nested).isFile());
  });

  it("rotateIfLarge drops the first half when over limit", () => {
    for (let i = 0; i < 200; i++) appendJsonl(file, { i, padding: "xxxxxxxxxxxxxxxxxxxxxxxx" });
    const before = statSync(file).size;
    assert.ok(before > 5000);
    rotateIfLarge(file, 5000);
    const after = statSync(file).size;
    assert.ok(
      after <= before / 2 + 200,
      `expected rotation to halve file, before=${before} after=${after}`,
    );
    const lines = readFileSync(file, "utf8").trim().split("\n");
    assert.ok(lines.length < 200);
    const last = JSON.parse(lines[lines.length - 1]);
    assert.equal(last.i, 199);
  });

  it("rotateIfLarge is a no-op when under limit", () => {
    appendJsonl(file, { a: 1 });
    const before = readFileSync(file, "utf8");
    rotateIfLarge(file, 10_000_000);
    assert.equal(readFileSync(file, "utf8"), before);
  });
});
