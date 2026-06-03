import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildListenArgs } from "./index.ts";

describe("buildListenArgs", () => {
  it("launches the running script directly for a normal install", () => {
    const args = buildListenArgs({
      scriptPath: "/usr/local/bin/dial",
      nodeDir: "/usr/local/bin",
      npxExists: true,
    });
    assert.deepEqual(args, ["/usr/local/bin/dial", "listen"]);
  });

  it("re-invokes through npx when launched from the npx cache", () => {
    const args = buildListenArgs({
      scriptPath: "/home/x/.npm/_npx/abc123/node_modules/@getdial/cli/dist/cli.js",
      nodeDir: "/home/x/.nvm/versions/node/v22.20.0/bin",
      npxExists: true,
    });
    assert.deepEqual(args, [
      "/home/x/.nvm/versions/node/v22.20.0/bin/npx",
      "-y",
      "@getdial/cli",
      "listen",
    ]);
  });

  it("falls back to a bare npx when none sits beside node", () => {
    const args = buildListenArgs({
      scriptPath: "/root/.npm/_npx/deadbeef/node_modules/.bin/dial",
      nodeDir: "/usr/bin",
      npxExists: false,
    });
    assert.deepEqual(args, ["npx", "-y", "@getdial/cli", "listen"]);
  });

  it("honors DIAL_BIN_OVERRIDE even under npx", () => {
    const args = buildListenArgs({
      override: "/opt/dial",
      scriptPath: "/home/x/.npm/_npx/abc/node_modules/@getdial/cli/dist/cli.js",
      nodeDir: "/usr/bin",
      npxExists: true,
    });
    assert.deepEqual(args, ["/opt/dial", "listen"]);
  });

  it("falls back to `dial` when the script path is empty", () => {
    const args = buildListenArgs({ scriptPath: "", nodeDir: "/usr/bin", npxExists: false });
    assert.deepEqual(args, ["dial", "listen"]);
  });
});
