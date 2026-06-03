import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderLaunchdPlist } from "./launchd.ts";

describe("launchd plist", () => {
  it("contains program path, listen arg, RunAtLoad, KeepAlive, log paths", () => {
    const xml = renderLaunchdPlist({
      label: "ai.getdial.listen",
      programArgs: ["/usr/local/bin/dial", "listen"],
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

  it("renders a multi-arg npx invocation as separate <string> elements", () => {
    const xml = renderLaunchdPlist({
      label: "ai.getdial.listen",
      programArgs: ["/usr/local/bin/npx", "-y", "@getdial/cli", "listen"],
      stdoutPath: "/x/out.log",
      stderrPath: "/x/err.log",
    });
    assert.match(
      xml,
      /<string>\/usr\/local\/bin\/npx<\/string>\s*<string>-y<\/string>\s*<string>@getdial\/cli<\/string>\s*<string>listen<\/string>/,
    );
  });
});
