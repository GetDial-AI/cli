import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { createGroup } from "../../lib/ops/groups.ts";
import { groupNotAddedSchema, groupSchema } from "../schemas.ts";

const inputSchema = {
  channel: z
    .enum(["whatsapp"])
    .optional()
    .describe('The channel to create the group on. Only "whatsapp" today, and the default when omitted'),
  fromNumber: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The line that creates the group and becomes its admin: a phone number id, one of your numbers in E.164, or a nickname. Exclusive with fromNumberId; omit both to use your primary number. It must be a WhatsApp-ready line",
    ),
  fromNumberId: z
    .string()
    .optional()
    .describe("Number id to create the group from; defaults to your primary number"),
  name: z.string().min(1).max(100).describe("The group's name (1–100 characters)"),
  participants: z
    .array(z.string().min(7))
    .min(1)
    .max(256)
    .describe(
      "Numbers to add, E.164 (1–256; duplicates are dropped). The creating line's own number is refused",
    ),
};

export const createGroupTool: ToolModule = {
  name: "create_group",
  config: {
    title: "Create Group",
    description:
      "Create a WhatsApp group from one of your lines, which becomes its admin. The new group's id " +
      "works at once: pass it as groupId to send_message or list_messages, and it appears in " +
      "list_groups. Some participants can end up outside the group even though it was created — " +
      "notAdded lists each one with a reason (privacy_restricted means their privacy settings only " +
      "let contacts add them). A timeout means the group may still exist: check list_groups before " +
      "trying again, or you may create it twice.",
    inputSchema,
    outputSchema: { group: groupSchema, notAdded: z.array(groupNotAddedSchema) },
    annotations: { openWorldHint: true },
  },
  run: async (args) =>
    jsonResult(
      await createGroup({
        channel: args.channel as string | undefined,
        fromNumber: args.fromNumber as string | undefined,
        fromNumberId: args.fromNumberId as string | undefined,
        name: args.name as string,
        participants: args.participants as string[],
      }),
    ),
};
