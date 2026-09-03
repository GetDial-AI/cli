import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { listGroups } from "../../lib/ops/groups.ts";
import { groupSchema } from "../schemas.ts";

export const listGroupsTool: ToolModule = {
  name: "list_groups",
  config: {
    title: "List Groups",
    description:
      "List the group conversations your lines are in. A group is a conversation that isn't a phone " +
      "number, so it has an id of its own: pass it as groupId to send_message, or to list_messages to " +
      "read that conversation. Groups exist on WhatsApp lines. " +
      "A group's name can be null — it is read live from the line holding the conversation, so a line " +
      "that can't answer in time yields a null name rather than hiding the group. " +
      "There is no join event: list again to see a group your line was just added to.",
    inputSchema: {},
    outputSchema: { groups: z.array(groupSchema) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async () => jsonResult({ groups: await listGroups() }),
};
