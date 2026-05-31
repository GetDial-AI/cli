import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderLaunchdPlist } from "./launchd.ts";

describe("launchd plist", () => {
  it("contains program path, listen arg, RunAtLoad, KeepAlive, log paths", () => {
    const xml = renderLaunchdPlist({
      label: "ai.getdial.listen",
      programPath: "/usr/local/bin/dial",
      stdoutPath: "/Users/x/.local/state/dial/listen.out.log",
      stderrPath: "/Users/x/.local/state/dial/listen.err.log",
    });
    assert.match(xml, /<key>Label<\/key>\s*<string>ai\.getdial\.listen<\/string>/);
    assert.match(xml, /<string>\/usr\/local\/bin\/dial<\/string>\s*<string>listen<\/string>/);
    assert.match(xml, /<key>RunAtLoad<\/key>\s*<true\/>/);
    assert.match(xml, /<key>KeepAlive<\/key>\s*<true\/>/);
    assert.match(xml, /listen\.out\.log/);
    assert.match(xml, /listen\.err\.log/);
  });
});
