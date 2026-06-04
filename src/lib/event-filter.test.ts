import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matches, parseFieldArg, parseRegexArg } from "./event-filter.ts";

describe("event-filter", () => {
  it("parseFieldArg splits on the first =", () => {
    assert.deepEqual(parseFieldArg("to=+14155551234"), { name: "to", value: "+14155551234" });
    assert.deepEqual(parseFieldArg("body=hello=world"), { name: "body", value: "hello=world" });
  });

  it("parseFieldArg rejects malformed input", () => {
    assert.throws(() => parseFieldArg("notanequals"));
    assert.throws(() => parseFieldArg("=novalue"));
  });

  it("parseRegexArg supports bare pattern", () => {
    const f = parseRegexArg("body=verif");
    assert.equal(f.name, "body");
    assert.ok(f.regex.test("verification code"));
    assert.ok(!f.regex.test("hello"));
  });

  it("parseRegexArg supports /pattern/flags", () => {
    const f = parseRegexArg("body=/^code: \\d{6}$/i");
    assert.ok(f.regex.test("Code: 123456"));
    assert.ok(!f.regex.test("nope"));
  });

  it("matches checks event type", () => {
    const spec = { eventType: "call.ended", fields: [], regexes: [] };
    assert.ok(matches({ type: "call.ended", data: { from: "+1" } }, spec));
    assert.ok(!matches({ type: "message.received" }, spec));
  });

  it("matches checks exact fields (in data)", () => {
    const spec = { eventType: "call.ended", fields: [{ name: "to", value: "+14155551234" }], regexes: [] };
    assert.ok(matches({ type: "call.ended", data: { to: "+14155551234" } }, spec));
    assert.ok(!matches({ type: "call.ended", data: { to: "+19999999999" } }, spec));
    assert.ok(!matches({ type: "call.ended", data: {} }, spec));
  });

  it("matches checks regex fields (in data)", () => {
    const spec = {
      eventType: "message.received",
      fields: [],
      regexes: [parseRegexArg("body=/\\b\\d{6}\\b/")],
    };
    assert.ok(matches({ type: "message.received", data: { body: "Your code is 847291" } }, spec));
    assert.ok(!matches({ type: "message.received", data: { body: "hi" } }, spec));
  });

  it("matches treats missing fields as empty string", () => {
    const spec = { eventType: "call.ended", fields: [{ name: "to", value: "" }], regexes: [] };
    assert.ok(matches({ type: "call.ended", data: {} }, spec));
  });

  it("matches rejects non-object input", () => {
    const spec = { eventType: "call.ended", fields: [], regexes: [] };
    assert.ok(!matches(null, spec));
    assert.ok(!matches("string", spec));
  });
});
