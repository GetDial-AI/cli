import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runMessageSend } from "./send.ts";

describe("message send --poll local checks", () => {
  it("refuses --poll with fewer than two --option before any request", async () => {
    const code = await runMessageSend({
      to: "+1",
      poll: "Which day?",
      option: ["Mon"],
      json: false,
    });
    assert.equal(code, 2);
  });
  it("refuses --poll alongside --body", async () => {
    const code = await runMessageSend({
      to: "+1",
      poll: "Which day?",
      option: ["Mon", "Tue"],
      body: "hi",
      json: false,
    });
    assert.equal(code, 2);
  });
  it("refuses --option without --poll", async () => {
    const code = await runMessageSend({ to: "+1", body: "hi", option: ["Mon"], json: false });
    assert.equal(code, 2);
  });
});
