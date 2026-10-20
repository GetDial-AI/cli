import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import {
  deletePolicy,
  getPolicy,
  listPolicies,
  patchPolicy,
  postPolicy,
  postPolicyEntries,
  removePolicyEntries,
  type PolicyBody,
  type PolicyEntryInput,
} from "../../lib/ops/policies.ts";
import { policyEntryInputSchema, policySchema } from "../schemas.ts";

// The seven allow-list tools, mirroring the hosted server's (frontend/src/lib/mcp/tools/*-policy*.ts)
// name for name and input for input. Kept in one file: each is a one-line call to the policy ops.

const policyId = z.string().min(1).describe("The policy id");

export const listPoliciesTool: ToolModule = {
  name: "list_policies",
  config: {
    title: "List Policies",
    description:
      "List the account's policies. Today every policy is an allow list for inbound calls: only callers on it ring " +
      "through, and other inbound calls are declined. Each item has entryCount but no entries; use get_policy for the callers.",
    inputSchema: {},
    outputSchema: { policies: z.array(policySchema) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async () => jsonResult({ policies: await listPolicies() }),
};

export const getPolicyTool: ToolModule = {
  name: "get_policy",
  config: {
    title: "Get Policy",
    description: "Fetch one allow list, including every caller on it.",
    inputSchema: { policyId: z.string().min(1).describe("The policy id (from list_policies)") },
    outputSchema: { policy: policySchema },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async (args) => jsonResult({ policy: await getPolicy(args.policyId as string) }),
};

export const createPolicyTool: ToolModule = {
  name: "create_policy",
  config: {
    title: "Create Policy",
    description:
      "Create an allow list for inbound calls: callers not on it are declined before the call connects, recorded as a " +
      'call with status.terminationType "blocked". Outbound calls and messages are not affected.',
    inputSchema: {
      name: z.string().min(1).max(60).describe('Name of the list, e.g. "Known customers"'),
      scope: z
        .enum(["account", "numbers"])
        .describe(
          '"account" covers every number on the account, including ones added later (at most one per account). ' +
            '"numbers" covers numberIds only and replaces the account-wide list on them (a number can be on one list of its own).',
        ),
      numberIds: z.array(z.string()).optional().describe('Phone number ids to cover; required for scope "numbers". Only numbers that can take calls.'),
      enabled: z.boolean().optional().describe("Whether it screens calls right away (default true)"),
      entries: z
        .array(policyEntryInputSchema)
        .max(10_000)
        .optional()
        .describe("The callers allowed through. An enabled list with no callers declines every inbound call on its numbers."),
    },
    outputSchema: { policy: policySchema },
    annotations: { openWorldHint: true },
  },
  run: async (args) => jsonResult({ policy: await postPolicy(args as PolicyBody) }),
};

export const updatePolicyTool: ToolModule = {
  name: "update_policy",
  config: {
    title: "Update Policy",
    description: "Change an allow list's name, coverage, on/off state or callers. Applies to the next inbound call.",
    inputSchema: {
      policyId,
      name: z.string().min(1).max(60).optional(),
      scope: z.enum(["account", "numbers"]).optional().describe('Changing to "numbers" requires numberIds'),
      numberIds: z.array(z.string()).optional().describe("Replaces the covered numbers"),
      enabled: z.boolean().optional().describe("false pauses the list; its numbers fall back to the account-wide list, if any"),
      entries: z
        .array(policyEntryInputSchema)
        .max(10_000)
        .optional()
        .describe("Replaces the WHOLE list of callers; to change a few use add_policy_entries / remove_policy_entries"),
    },
    outputSchema: { policy: policySchema },
    annotations: { openWorldHint: true },
  },
  run: async (args) => {
    const { policyId: id, ...body } = args;
    return jsonResult({ policy: await patchPolicy(id as string, body as PolicyBody) });
  },
};

export const deletePolicyTool: ToolModule = {
  name: "delete_policy",
  config: {
    title: "Delete Policy",
    description: "Delete an allow list. Numbers it covered fall back to the account-wide list, if there is one.",
    inputSchema: { policyId },
    outputSchema: { deleted: z.literal(true), policyId: z.string() },
    annotations: { destructiveHint: true, openWorldHint: true },
  },
  run: async (args) => {
    await deletePolicy(args.policyId as string);
    return jsonResult({ deleted: true, policyId: args.policyId as string });
  },
};

export const addPolicyEntriesTool: ToolModule = {
  name: "add_policy_entries",
  config: {
    title: "Add Policy Entries",
    description: "Add callers to an allow list without resending the whole list.",
    inputSchema: {
      policyId,
      entries: z.array(policyEntryInputSchema).min(1).describe("Callers to allow; one already on the list takes the given label"),
    },
    outputSchema: { policy: policySchema },
    annotations: { idempotentHint: true, openWorldHint: true },
  },
  run: async (args) =>
    jsonResult({ policy: await postPolicyEntries(args.policyId as string, args.entries as PolicyEntryInput[]) }),
};

export const removePolicyEntriesTool: ToolModule = {
  name: "remove_policy_entries",
  config: {
    title: "Remove Policy Entries",
    description: "Remove callers from an allow list.",
    inputSchema: {
      policyId,
      numbers: z.array(z.string().min(1)).min(1).describe("Callers to remove, E.164; numbers not on the list are ignored"),
    },
    outputSchema: { policy: policySchema },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
  },
  run: async (args) =>
    jsonResult({ policy: await removePolicyEntries(args.policyId as string, args.numbers as string[]) }),
};
