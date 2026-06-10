import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { paths } from "./paths.ts";

const ORIGINAL_ENV = { ...process.env };

describe("paths", () => {
  beforeEach(() => {
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_DATA_HOME;
    delete process.env.XDG_STATE_HOME;
    process.env.HOME = "/Users/test";
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to ~/.config/dial when XDG_CONFIG_HOME is unset", () => {
    assert.equal(paths().configDir, "/Users/test/.config/dial");
  });
  it("defaults to ~/.local/share/dial when XDG_DATA_HOME is unset", () => {
    assert.equal(paths().dataDir, "/Users/test/.local/share/dial");
  });
  it("defaults to ~/.local/state/dial when XDG_STATE_HOME is unset", () => {
    assert.equal(paths().stateDir, "/Users/test/.local/state/dial");
  });
  it("respects XDG env vars when set", () => {
    process.env.XDG_DATA_HOME = "/custom/data";
    assert.equal(paths().dataDir, "/custom/data/dial");
  });
  it("exposes log and pid paths", () => {
    const p = paths();
    assert.equal(p.listenLog, "/Users/test/.local/state/dial/listen.log");
    assert.equal(p.cliLog, "/Users/test/.local/state/dial/cli.log");
    assert.equal(p.listenPid, "/Users/test/.local/state/dial/listen.pid");
  });
});
