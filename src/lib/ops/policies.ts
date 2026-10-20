import { apiDelete, apiGet, apiPatch, apiPost } from "../api.ts";
import { maybeAuth } from "./auth.ts";
import { DialError } from "./errors.ts";
import { resolveNumberId } from "./numbers.ts";

/**
 * Allow lists for inbound calls (/api/v1/policies). A list covers every number on
 * the account or a chosen set; a number's own list replaces the account-wide one,
 * and callers not on the list that applies are declined before the call connects.
 */
export type PolicyEntry = { number: string; label: string | null };

export type Policy = {
  id: string;
  name: string;
  type: "allow_list";
  appliesTo: "inbound_calls";
  scope: "account" | "numbers";
  numberIds: string[];
  enabled: boolean;
  entryCount: number;
  /** Present on single-policy responses; omitted from the list. */
  entries?: PolicyEntry[];
  blockedCallsLast7Days: number;
  createdAt: string;
  updatedAt: string;
};

export type CreatePolicyInput = {
  name: string;
  allNumbers?: boolean;
  /** Number ids, owned E.164s or nicknames; resolved to ids. */
  numbers?: string[];
  allow: string[];
  enabled: boolean;
};

export type UpdatePolicyInput = {
  name?: string;
  allNumbers?: boolean;
  numbers?: string[];
  enabled?: boolean;
};

function fail(error: string, status: number): never {
  throw new DialError("policy_failed", error, status);
}

type Coverage = { scope: "account" } | { scope: "numbers"; numberIds: string[] };

/**
 * The `scope` (and resolved `numberIds`) a request sends, from exactly one of
 * --all-numbers and --number. Checked before any request; undefined when neither
 * was given and the verb allows that (update leaves coverage unchanged).
 */
async function coverageOf(input: { allNumbers?: boolean; numbers?: string[] }, required: boolean): Promise<Coverage | undefined> {
  const refs = input.numbers ?? [];
  if (input.allNumbers && refs.length > 0) {
    throw new DialError("bad_scope", "Pass either --all-numbers or --number, not both.");
  }
  if (input.allNumbers) return { scope: "account" };
  if (refs.length > 0) {
    const numberIds: string[] = [];
    for (const ref of refs) numberIds.push(await resolveNumberId(ref));
    return { scope: "numbers", numberIds };
  }
  if (required) throw new DialError("bad_scope", "Pass --all-numbers, or --number for each number the list covers.");
  return undefined;
}

export async function listPolicies(): Promise<Policy[]> {
  const res = await apiGet<{ policies: Policy[] }>("/api/v1/policies", maybeAuth()?.apiKey);
  if (!res.ok) fail(res.error, res.status);
  return res.data.policies;
}

export async function getPolicy(id: string): Promise<Policy> {
  const res = await apiGet<{ policy: Policy }>(`/api/v1/policies/${encodeURIComponent(id)}`, maybeAuth()?.apiKey);
  if (!res.ok) fail(res.error, res.status);
  return res.data.policy;
}

/** The REST bodies, as the MCP tools take them. */
export type PolicyEntryInput = { number: string; label?: string | null };
export type PolicyBody = {
  name?: string;
  scope?: "account" | "numbers";
  numberIds?: string[];
  enabled?: boolean;
  entries?: PolicyEntryInput[];
};

export async function postPolicy(body: PolicyBody): Promise<Policy> {
  const res = await apiPost<{ policy: Policy }>("/api/v1/policies", body, maybeAuth()?.apiKey);
  if (!res.ok) fail(res.error, res.status);
  return res.data.policy;
}

export async function patchPolicy(id: string, body: PolicyBody): Promise<Policy> {
  const res = await apiPatch<{ policy: Policy }>(`/api/v1/policies/${encodeURIComponent(id)}`, body, maybeAuth()?.apiKey);
  if (!res.ok) fail(res.error, res.status);
  return res.data.policy;
}

export async function createPolicy(input: CreatePolicyInput): Promise<Policy> {
  const coverage = await coverageOf(input, true);
  return postPolicy({
    name: input.name,
    ...coverage,
    enabled: input.enabled,
    entries: input.allow.map((number) => ({ number })),
  });
}

export async function updatePolicy(id: string, input: UpdatePolicyInput): Promise<Policy> {
  const coverage = await coverageOf(input, false);
  return patchPolicy(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...coverage,
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
  });
}

export async function deletePolicy(id: string): Promise<void> {
  const res = await apiDelete<null>(`/api/v1/policies/${encodeURIComponent(id)}`, undefined, maybeAuth()?.apiKey);
  if (!res.ok) fail(res.error, res.status);
}

export async function addPolicyEntries(id: string, numbers: string[], label?: string): Promise<Policy> {
  return postPolicyEntries(
    id,
    numbers.map((number) => (label !== undefined ? { number, label } : { number })),
  );
}

export async function postPolicyEntries(id: string, entries: PolicyEntryInput[]): Promise<Policy> {
  const res = await apiPost<{ policy: Policy }>(
    `/api/v1/policies/${encodeURIComponent(id)}/entries`,
    { entries },
    maybeAuth()?.apiKey,
  );
  if (!res.ok) fail(res.error, res.status);
  return res.data.policy;
}

export async function removePolicyEntries(id: string, numbers: string[]): Promise<Policy> {
  const res = await apiDelete<{ policy: Policy }>(
    `/api/v1/policies/${encodeURIComponent(id)}/entries`,
    { numbers },
    maybeAuth()?.apiKey,
  );
  if (!res.ok) fail(res.error, res.status);
  return res.data.policy;
}
