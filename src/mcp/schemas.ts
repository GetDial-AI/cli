import { z } from "zod";

/**
 * Reusable Zod output schemas for tool results. Inner entity objects are
 * `.passthrough()` so extra fields aren't stripped from `structuredContent`.
 * Mirrors the remote server's schemas so the two surfaces stay aligned.
 */

// Status is either a simple string (e.g. a message's "queued"/"delivered") or a
// structured call-status object. `.passthrough()` tolerates extra provider fields.
const callStatusObjectSchema = z
  .object({
    state: z.string().nullish().describe('Lifecycle state, e.g. "Terminated", "Registered"'),
    terminationType: z.string().nullish().describe('How it ended, e.g. "completed", "no-answer" (null until the call ends)'),
    label: z.string().nullish().describe('Human-readable status, e.g. "Completed"'),
    cancelRequested: z.boolean().nullish(),
    cancelPending: z.boolean().nullish(),
  })
  .passthrough();

const statusSchema = z
  .union([z.string(), callStatusObjectSchema])
  .describe("Status — a plain string, or a structured call-status object");

export const phoneNumberSchema = z
  .object({
    id: z.string().describe("Phone number id (pn_…)"),
    number: z.string().describe("E.164 phone number"),
    nickname: z.string().nullable().optional().describe("Human-readable label for the number"),
    country: z.string().optional(),
    inboundInstruction: z.string().nullable().optional(),
    inboundVoiceGender: z.string().nullable().optional().describe('Voice gender for inbound calls ("male"/"female"); null → female (the default)'),
  })
  .passthrough();

export const messageSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    body: z.string(),
    channel: z.string().optional(),
    direction: z.string().optional(),
    status: statusSchema,
    statusError: z.string().nullish().describe("Failure reason when status is undelivered/failed"),
    replyToId: z.string().nullish().describe("Id of the message this one replies or reacts to; null for ordinary messages"),
    reaction: z.string().nullish().describe("The reaction this message carries (a reaction name or an emoji); null otherwise"),
    createdAt: z.string().optional(),
  })
  .passthrough();

export const callSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    direction: z.string().optional(),
    status: statusSchema,
    duration: z.number().nullish(),
    transcript: z.string().nullish(),
    instruction: z.string().nullable().optional(),
    createdAt: z.string().optional(),
  })
  .passthrough();

export const eventSchema = z
  .object({})
  .passthrough()
  .describe("The matched account event; shape varies by event type");

export const localTargetSchema = z
  .object({
    kind: z.string().describe('"url" or "cmd"'),
    id: z.string().describe("Target id (URL for url targets, path for cmd targets)"),
    target: z.object({}).passthrough(),
  })
  .passthrough();
