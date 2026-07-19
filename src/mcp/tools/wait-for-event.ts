import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { waitForEvent } from "../../lib/ops/events.ts";
import { eventSchema } from "../schemas.ts";

const inputSchema = {
  eventType: z
    .string()
    .min(1)
    .describe('Event type to wait for (e.g. "call.ended", "message.received")'),
  field: z
    .array(z.string())
    .optional()
    .describe('Exact-match filters, each "name=value" (e.g. "callId=abc")'),
  regex: z
    .array(z.string())
    .optional()
    .describe('Regex filters, each "name=pattern" (/re/flags or a bare regex)'),
  timeoutSeconds: z.number().default(30).describe("How long to wait before giving up"),
};

export const waitForEventTool: ToolModule = {
  name: "wait_for_event",
  config: {
    title: "Wait For Event",
    description:
      "Block until a matching account event arrives. Reads the local listen log when the daemon " +
      "is running, otherwise long-polls the REST API. Returns the event, or a timeout result.",
    inputSchema,
    outputSchema: {
      source: z.string().nullable().describe('"log", "api", or null when nothing matched'),
      timedOut: z.boolean(),
      event: eventSchema.nullable(),
      line: z.string().nullable().describe("Raw matched event line, when available"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async (args) =>
    jsonResult(
      await waitForEvent({
        eventType: args.eventType as string,
        fields: (args.field as string[] | undefined) ?? [],
        regexes: (args.regex as string[] | undefined) ?? [],
        timeoutSeconds: (args.timeoutSeconds as number | undefined) ?? 30,
      }),
    ),
};
