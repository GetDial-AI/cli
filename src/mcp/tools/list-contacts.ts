import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { listContacts } from "../../lib/ops/contacts.ts";
import { contactSchema } from "../schemas.ts";

const inputSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Max contacts to return (1-1000; default 100)"),
  startingAfter: z
    .string()
    .optional()
    .describe(
      "ISO-8601 cursor — the lastAt of the last contact you received; returns only older ones",
    ),
};

export const listContactsTool: ToolModule = {
  name: "list_contacts",
  config: {
    title: "List Contacts",
    description:
      "List every number your lines have exchanged a message or a call with, newest activity first, with " +
      "per-contact counts and a summary of the most recent interaction. Derived from history — there is no " +
      "address book to add anyone to. Counts span every line on the account, so one person reached on two of " +
      "your numbers is one contact. Group conversations are not contacts; use list_groups for those. Pass a " +
      "contact's `number` to list_messages as `contact` to read that one conversation.",
    inputSchema,
    outputSchema: { contacts: z.array(contactSchema), hasMore: z.boolean() },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async (args) =>
    jsonResult(
      await listContacts({
        limit: args.limit as number | undefined,
        startingAfter: args.startingAfter as string | undefined,
      }),
    ),
};
