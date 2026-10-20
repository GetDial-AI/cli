import {
  addPolicyEntries,
  createPolicy,
  deletePolicy,
  getPolicy,
  listPolicies,
  removePolicyEntries,
  updatePolicy,
  type CreatePolicyInput,
  type Policy,
  type UpdatePolicyInput,
} from "../../lib/ops/policies.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";
import { formatPolicyDetail, formatPolicyLine } from "./format.ts";

// `dial policy …`: allow lists for inbound calls. Each runner prints the policy it
// touched (or the list), and every DialError the same way the other verbs do.

async function run(json: boolean, body: () => Promise<void>): Promise<number> {
  try {
    await body();
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(json, e);
    throw e;
  }
}

function printPolicy(json: boolean, policy: Policy, verb: string): void {
  if (json) console.log(JSON.stringify({ ok: true, policy }));
  else {
    console.log(`${verb}.`);
    console.log(formatPolicyDetail(policy));
  }
}

export function runPolicyList(opts: { json: boolean }): Promise<number> {
  return run(opts.json, async () => {
    const policies = await listPolicies();
    if (opts.json) console.log(JSON.stringify({ ok: true, policies }));
    else if (policies.length === 0) console.log("no policies. every caller can reach every number; add an allow list with `dial policy create`.");
    else for (const p of policies) console.log(formatPolicyLine(p));
  });
}

export function runPolicyGet(opts: { id: string; json: boolean }): Promise<number> {
  return run(opts.json, async () => {
    const policy = await getPolicy(opts.id);
    if (opts.json) console.log(JSON.stringify({ ok: true, policy }));
    else console.log(formatPolicyDetail(policy));
  });
}

export function runPolicyCreate(opts: CreatePolicyInput & { json: boolean }): Promise<number> {
  return run(opts.json, async () => printPolicy(opts.json, await createPolicy(opts), "created"));
}

export function runPolicyUpdate(opts: UpdatePolicyInput & { id: string; json: boolean }): Promise<number> {
  return run(opts.json, async () => printPolicy(opts.json, await updatePolicy(opts.id, opts), "updated"));
}

export function runPolicyDelete(opts: { id: string; json: boolean }): Promise<number> {
  return run(opts.json, async () => {
    await deletePolicy(opts.id);
    if (opts.json) console.log(JSON.stringify({ ok: true, deleted: true, policyId: opts.id }));
    else console.log(`deleted ${opts.id}.`);
  });
}

export function runPolicyAllow(opts: { id: string; numbers: string[]; label?: string; json: boolean }): Promise<number> {
  return run(opts.json, async () => printPolicy(opts.json, await addPolicyEntries(opts.id, opts.numbers, opts.label), "allowed"));
}

export function runPolicyDisallow(opts: { id: string; numbers: string[]; json: boolean }): Promise<number> {
  return run(opts.json, async () => printPolicy(opts.json, await removePolicyEntries(opts.id, opts.numbers), "removed"));
}
