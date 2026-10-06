import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatNumberLine } from "./list.ts";

// `dial number list`'s human output for replaced numbers: Dial moved a number onto a new line and
// kept its id; the old E.164 is listed as its own row, routing to the live one.

describe("formatNumberLine", () => {
  it("marks the numbers a live number replaced", () => {
    const line = formatNumberLine(
      {
        id: "pn_live",
        number: "+14155550199",
        country: "US",
        replaces: [{ id: "pn_old", number: "+14155550123", replacedAt: "2026-10-06T10:00:00Z" }],
        replacedBy: null,
      },
      null,
    );
    assert.equal(line, "+14155550199  id=pn_live  US  replaces:+14155550123");
  });

  it("marks a replaced number with the number it routes to", () => {
    const line = formatNumberLine(
      {
        id: "pn_old",
        number: "+14155550123",
        country: "US",
        replaces: [],
        replacedBy: { id: "pn_live", number: "+14155550199" },
      },
      null,
    );
    assert.equal(line, "+14155550123  id=pn_old  US  replaced-by:+14155550199");
  });

  it("leaves a number with no replacement as it was", () => {
    assert.equal(
      formatNumberLine({ id: "pn_1", number: "+14155550100", country: "US" }, "pn_1"),
      "+14155550100  id=pn_1  US  (default)",
    );
  });
});
