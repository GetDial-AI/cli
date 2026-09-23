import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { lookupNumber } from "../../lib/ops/lookup.ts";

const inputSchema = {
  number: z
    .string()
    .describe(
      "The phone number to look up, in E.164 — e.g. +14155550123. Any number, not just your own.",
    ),
};

export const lookupNumberTool: ToolModule = {
  name: "lookup_number",
  config: {
    title: "Look Up A Number",
    description:
      "Check what channels a phone number can receive on, before sending to it. Works on ANY number in the " +
      "world — it doesn't have to be one of your numbers, and you don't have to have messaged it before. " +
      "`supports` describes the number you asked about, not your own line: each key is a channel and the " +
      "boolean says whether that number can be reached there. Read the channels you need by name, since more " +
      "are added over time. The answer is point-in-time, not a property of the number — someone who changes " +
      "device or turns the service off stops being reachable — so treat `true` as a strong signal for picking " +
      "a channel rather than a promise that the send will land. A lookup that fails is an error, never a " +
      "`false`, so a `false` always means the number genuinely isn't reachable there. It needs nothing from " +
      "this account: you don't have to hold an iMessage or WhatsApp number to ask about either channel.",
    inputSchema,
    outputSchema: {
      number: z.string().describe("The number you asked about, normalized to E.164"),
      supports: z
        .object({
          imessage: z.boolean().describe("Whether the number can currently receive iMessage"),
          whatsapp: z.boolean().describe("Whether the number can currently receive WhatsApp"),
        })
        .describe("One key per channel, true when the number can be reached there"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async (args) => jsonResult(await lookupNumber(args.number as string)),
};
