import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderSystemdUnit } from "./systemd.ts";

describe("systemd unit", () => {
  it("contains ExecStart, Restart, WantedBy", () => {
    const unit = renderSystemdUnit({ programPath: "/home/x/.local/bin/dial" });
    assert.match(unit, /ExecStart=\/home\/x\/\.local\/bin\/dial listen/);
    assert.match(unit, /Restart=on-failure/);
    assert.match(unit, /WantedBy=default\.target/);
  });
});
