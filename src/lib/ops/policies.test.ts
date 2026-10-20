import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../state.ts";
import { startMockApi } from "../../test-utils.ts";
import {
  addPolicyEntries,
  createPolicy,
  deletePolicy,
  getPolicy,
  listPolicies,
  removePolicyEntries,
  updatePolicy,
} from "./policies.ts";
import { isDialError } from "./errors.ts";

let tmp: string;
let api: { url: string; close: () => Promise<void> };
const seen: { method: string; url: string; body: unknown }[] = [];

const POLICY = {
  id: "pol_1",
  name: "Known customers",
  type: "allow_list",
  appliesTo: "inbound_calls",
  scope: "account",
  numberIds: [],
  enabled: true,
  entryCount: 1,
  entries: [{ number: "+14155550123", label: "Jordan" }],
  blockedCallsLast7Days: 0,
  createdAt: "2026-10-20T00:00:00.000Z",
  updatedAt: "2026-10-20T00:00:00.000Z",
};
const NUMBERS = [
  { id: "pn_1", number: "+15550001111", nickname: "Main", country: "US" },
  { id: "pn_2", number: "+15550002222", nickname: "Ops", country: "US" },
];

async function mock(
  route?: (m: string, u: string) => { status: number; json: unknown } | undefined,
) {
  api = await startMockApi((m, u, body) => {
    seen.push({ method: m, url: u, body: body ? JSON.parse(body) : undefined });
    const custom = route?.(m, u);
    if (custom) return custom;
    if (m === "GET" && u === "/api/v1/numbers") return { status: 200, json: { numbers: NUMBERS } };
    if (m === "GET" && u === "/api/v1/policies")
      return { status: 200, json: { policies: [POLICY] } };
    if (m === "DELETE" && u === "/api/v1/policies/pol_1") return { status: 204, json: null };
    if (u.startsWith("/api/v1/policies"))
      return {
        status: m === "POST" && u === "/api/v1/policies" ? 201 : 200,
        json: { policy: POLICY },
      };
    return undefined;
  });
  process.env.DIAL_API_URL = api.url;
}

describe("ops/policies", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-policies-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
    seen.length = 0;
    writeAuth({
      apiKey: "sk_live_x",
      accountId: "a",
      email: "e",
      phoneNumber: "+15550001111",
      phoneNumberId: "pn_1",
    });
  });
  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    delete process.env.DIAL_API_URL;
  });

  it("lists and gets policies", async () => {
    await mock();
    assert.deepEqual(await listPolicies(), [POLICY]);
    assert.deepEqual(await getPolicy("pol_1"), POLICY);
    assert.deepEqual(
      seen.map((s) => `${s.method} ${s.url}`),
      ["GET /api/v1/policies", "GET /api/v1/policies/pol_1"],
    );
  });

  it("creates an account-wide list with its callers", async () => {
    await mock();
    await createPolicy({
      name: "Known customers",
      allNumbers: true,
      allow: ["+14155550123"],
      enabled: true,
    });
    const post = seen.find((s) => s.method === "POST")!;
    assert.equal(post.url, "/api/v1/policies");
    assert.deepEqual(post.body, {
      name: "Known customers",
      scope: "account",
      enabled: true,
      entries: [{ number: "+14155550123" }],
    });
  });

  it("creates a numbers list, resolving numbers by E.164 or nickname", async () => {
    await mock();
    await createPolicy({
      name: "Field",
      numbers: ["+15550001111", "Ops"],
      allow: [],
      enabled: false,
    });
    const post = seen.find((s) => s.method === "POST")!;
    assert.deepEqual(post.body, {
      name: "Field",
      scope: "numbers",
      numberIds: ["pn_1", "pn_2"],
      enabled: false,
      entries: [],
    });
  });

  it("refuses both or neither of --all-numbers and --number before calling the API", async () => {
    await mock();
    for (const input of [
      { name: "x", allNumbers: true, numbers: ["pn_1"], allow: [], enabled: true },
      { name: "x", allow: [], enabled: true },
    ]) {
      await assert.rejects(createPolicy(input), (e) => isDialError(e) && e.code === "bad_scope");
    }
    assert.equal(seen.length, 0);
  });

  it("updates only the given fields; --all-numbers switches scope", async () => {
    await mock();
    await updatePolicy("pol_1", { enabled: false });
    await updatePolicy("pol_1", { allNumbers: true });
    await updatePolicy("pol_1", { numbers: ["Ops"], name: "Ops only" });
    const patches = seen.filter((s) => s.method === "PATCH").map((s) => s.body);
    assert.deepEqual(patches, [
      { enabled: false },
      { scope: "account" },
      { name: "Ops only", scope: "numbers", numberIds: ["pn_2"] },
    ]);
  });

  it("adds and removes callers through the entries endpoint", async () => {
    await mock();
    await addPolicyEntries("pol_1", ["+14155550199", "+14155550200"], "Sam");
    await removePolicyEntries("pol_1", ["+14155550199"]);
    await deletePolicy("pol_1");
    assert.deepEqual(
      seen.map((s) => [s.method, s.url, s.body]),
      [
        [
          "POST",
          "/api/v1/policies/pol_1/entries",
          {
            entries: [
              { number: "+14155550199", label: "Sam" },
              { number: "+14155550200", label: "Sam" },
            ],
          },
        ],
        ["DELETE", "/api/v1/policies/pol_1/entries", { numbers: ["+14155550199"] }],
        ["DELETE", "/api/v1/policies/pol_1", undefined],
      ],
    );
  });

  it("surfaces a conflict's message as a DialError", async () => {
    await mock((m, u) =>
      m === "POST" && u === "/api/v1/policies"
        ? {
            status: 409,
            json: {
              error: '"Known customers" (pol_1) already covers all numbers.',
              code: "account_policy_exists",
            },
          }
        : undefined,
    );
    await assert.rejects(
      createPolicy({ name: "x", allNumbers: true, allow: [], enabled: true }),
      (e) => isDialError(e) && e.status === 409 && /already covers all numbers/.test(e.message),
    );
  });
});
