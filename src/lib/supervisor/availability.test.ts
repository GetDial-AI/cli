import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { supervisorAvailability } from "./index.ts";

describe("supervisorAvailability", () => {
  const orig = process.env.XDG_RUNTIME_DIR;
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-sup-"));
  });
  afterEach(() => {
    process.env.XDG_RUNTIME_DIR = orig;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns available on darwin", { skip: process.platform !== "darwin" }, () => {
    assert.deepEqual(supervisorAvailability(), { available: true });
  });

  it("returns unavailable on linux without XDG_RUNTIME_DIR", { skip: process.platform !== "linux" }, () => {
    delete process.env.XDG_RUNTIME_DIR;
    const r = supervisorAvailability();
    assert.equal(r.available, false);
    if (!r.available) assert.match(r.reason, /XDG_RUNTIME_DIR/);
  });

  it("returns unavailable on linux without systemd user bus socket", { skip: process.platform !== "linux" }, () => {
    process.env.XDG_RUNTIME_DIR = tmp;
    const r = supervisorAvailability();
    assert.equal(r.available, false);
    if (!r.available) assert.match(r.reason, /systemd user bus/);
  });

  it("returns available on linux when systemd user bus socket exists", { skip: process.platform !== "linux" }, () => {
    process.env.XDG_RUNTIME_DIR = tmp;
    mkdirSync(join(tmp, "systemd"));
    writeFileSync(join(tmp, "systemd", "private"), "");
    assert.deepEqual(supervisorAvailability(), { available: true });
  });
});
