import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { setNumberProperties } from "../../lib/ops/numbers.ts";
import { phoneNumberSchema } from "../schemas.ts";

const inputSchema = {
  number: z.string().min(7).describe("The E.164 phone number to update (e.g. +14155550123)"),
  inboundInstruction: z
    .string()
    .min(1)
    .optional()
    .describe("New system prompt for inbound calls to this number"),
  inboundVoiceGender: z
    .enum(["male", "female"])
    .optional()
    .describe("Voice gender for inbound calls to this number; the default is female"),
  inboundLanguage: z
    .string()
    .optional()
    .describe(
      "BCP-47 language tag pinning inbound calls to this number to one language (e.g. es-ES). Pass an empty string to clear it (reverts to detecting the language from the caller's country prefix per call).",
    ),
  nickname: z
    .string()
    .max(100)
    .optional()
    .describe(
      'Human-readable label for the number, e.g. "Support line". Pass an empty string to clear it.',
    ),
  maxCallDurationSeconds: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe(
      "Call duration cap for this number, in seconds, applied as a hard ceiling to both inbound and outbound calls (the smallest of the per-number, account, and per-call caps wins). On a free account (no top-up or subscription yet) a value above 300 is rejected with 400. Pass null to clear the cap; omit to leave it unchanged.",
    ),
  channel: z
    .enum(["imessage", "whatsapp", "both"])
    .optional()
    .describe(
      'Which display profile(s) `name` and `avatarUrl` are written to: "imessage", "whatsapp", or "both". Use this when the number should present the same identity everywhere — one call instead of two, validated against every targeted channel before any of them is written, so the profiles cannot drift apart. Cannot be combined with firstName/lastName/whatsappName/whatsappAvatarUrl.',
    ),
  name: z
    .string()
    .min(1)
    .optional()
    .describe(
      'The display name to set on the channel(s) `channel` names; requires `channel`. WhatsApp stores it verbatim (1-25 chars); iMessage has no single-name field, so it is split on the first space — "Ana Lee" becomes firstName "Ana", lastName "Lee".',
    ),
  firstName: z
    .string()
    .max(30)
    .optional()
    .describe(
      "iMessage display first name shown beside this number's messages in recipients' Messages apps. iMessage numbers only. Pass an empty string to clear it.",
    ),
  lastName: z
    .string()
    .max(30)
    .optional()
    .describe(
      "iMessage display last name. iMessage numbers only. Pass an empty string to clear it.",
    ),
  avatarUrl: z
    .string()
    .url()
    .optional()
    .describe(
      "Public image URL to set as the number's iMessage avatar photo (the server downloads it). jpeg/png/gif/webp, max 5 MB. iMessage numbers only. The photo can be replaced but not removed.",
    ),
  whatsappName: z
    .string()
    .optional()
    .describe(
      "WhatsApp display name shown to recipients. 1-25 chars, no reserved verification marks. WhatsApp-ready numbers only; the call blocks until WhatsApp applies it.",
    ),
  whatsappAvatarUrl: z
    .string()
    .url()
    .optional()
    .describe(
      "Public image URL to set as the number's WhatsApp avatar (the server downloads it). Square jpeg or png between 192x192 and 640x640 (not resized). WhatsApp-ready numbers only.",
    ),
  callingEnabled: z
    .boolean()
    .optional()
    .describe(
      "Switch calling on or off for this number, in both directions. false stops inbound calls from being connected (the caller is never answered) and makes place_call from this number fail with calling_disabled (409); messaging on the number is unaffected. Takes effect on the next call — a call already in progress is not ended. Omit to leave it unchanged.",
    ),
};

export const setNumberPropertiesTool: ToolModule = {
  name: "set_number_properties",
  config: {
    title: "Set Number Properties",
    description:
      'Update a phone number\'s properties: its inbound instruction (the system prompt for inbound calls), inbound voice gender, inbound language, nickname, whether calling is switched on at all (callingEnabled), and its display identity. For the display identity prefer `channel` ("imessage", "whatsapp", or "both") with `name`/`avatarUrl` — one call that keeps every channel\'s profile identical. The per-channel fields remain for when the profiles differ: firstName/lastName/avatarUrl for iMessage, whatsappName/whatsappAvatarUrl for WhatsApp-ready numbers. Provide at least one property, and don\'t mix `channel` with the per-channel fields.',
    inputSchema,
    outputSchema: { number: phoneNumberSchema },
    annotations: { openWorldHint: true },
  },
  run: async (args) =>
    jsonResult({
      number: await setNumberProperties({
        number: args.number as string,
        inboundInstruction: args.inboundInstruction as string | undefined,
        ...(args.inboundVoiceGender !== undefined
          ? { inboundVoiceGender: args.inboundVoiceGender as string }
          : {}),
        ...(args.inboundLanguage !== undefined
          ? { inboundLanguage: args.inboundLanguage as string }
          : {}),
        ...(args.nickname !== undefined ? { nickname: args.nickname as string } : {}),
        ...(args.maxCallDurationSeconds !== undefined
          ? { maxCallDurationSeconds: args.maxCallDurationSeconds as number | null }
          : {}),
        ...(args.channel !== undefined ? { channel: args.channel as string } : {}),
        ...(args.name !== undefined ? { name: args.name as string } : {}),
        ...(args.firstName !== undefined ? { firstName: args.firstName as string } : {}),
        ...(args.whatsappName !== undefined ? { whatsappName: args.whatsappName as string } : {}),
        ...(args.callingEnabled !== undefined
          ? { callingEnabled: args.callingEnabled as boolean }
          : {}),
        ...(args.whatsappAvatarUrl !== undefined
          ? { whatsappAvatar: args.whatsappAvatarUrl as string }
          : {}),
        ...(args.lastName !== undefined ? { lastName: args.lastName as string } : {}),
        ...(args.avatarUrl !== undefined ? { avatar: args.avatarUrl as string } : {}),
      }),
    }),
};
