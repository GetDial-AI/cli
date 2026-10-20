import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPolicyLine, formatPolicyDetail } from "./format.ts";
import { formatNumberLine } from "../number/list.ts";
import type { Policy } from "../../lib/ops/policies.ts";

// `dial policy list` / `get` human output, and the allow-list marker on `dial number list`.

const base: Policy = {
  id: "pol_1",
  name: "Known customers",
  type: "allow_list",
  appliesTo: "inbound_calls",
  scope: "account",
  numberIds: [],
  enabled: true,
  entryCount: 42,
  blockedCallsLast7Days: 19,
  createdAt: "2026-10-20T00:00:00.000Z",
  updatedAt: "2026-10-20T00:00:00.000Z",
};

describe("formatPolicyLine", () => {
  it("an account-wide list that is on", () => {
    assert.equal(
      formatPolicyLine(base),
      `pol_1  "Known customers"  all numbers  on  42 callers  19 blocked (7d)`,
    );
  });

  it("a list on chosen numbers that is off", () => {
    const p = {
      ...base,
      scope: "numbers" as const,
      numberIds: ["pn_1", "pn_2"],
      enabled: false,
      entryCount: 1,
    };
    assert.equal(
      formatPolicyLine(p),
      `pol_1  "Known customers"  numbers:pn_1,pn_2  off  1 caller  19 blocked (7d)`,
    );
  });
});

describe("formatPolicyDetail", () => {
  it("lists each caller with its label", () => {
    const text = formatPolicyDetail({
      ...base,
      entries: [
        { number: "+14155550123", label: "Jordan" },
        { number: "+442079460100", label: null },
      ],
    });
    assert.match(text, /\+14155550123 {2}Jordan/);
    assert.match(text, /\+442079460100\n?/);
  });

  it("says when a list has no callers and so declines every call", () => {
    assert.match(
      formatPolicyDetail({ ...base, entryCount: 0, entries: [] }),
      /no callers — every inbound call/,
    );
  });
});

describe("formatNumberLine", () => {
  it("marks a number an allow list screens", () => {
    const line = formatNumberLine(
      {
        id: "pn_1",
        number: "+14155550100",
        country: "US",
        inboundCallPolicy: { id: "pol_1", name: "Known customers", scope: "account" },
      },
      null,
    );
    assert.equal(line, `+14155550100  id=pn_1  US  allow-list:"Known customers"`);
  });
});
