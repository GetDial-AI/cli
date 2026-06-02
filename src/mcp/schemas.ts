import { z } from "zod";

/**
 * Reusable Zod output schemas for tool results. Inner entity objects are
 * `.passthrough()` so extra fields aren't stripped from `structuredContent`.
 * Mirrors the remote server's schemas so the two surfaces stay aligned.
 */

export const phoneNumberSchema = z
  .object({
    id: z.string().describe("Phone number id (pn_…)"),
    number: z.string().describe("E.164 phone number"),
    country: z.string().optional(),
    inboundInstruction: z.string().nullable().optional(),
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
    status: z.string(),
    createdAt: z.string().optional(),
  })
  .passthrough();

export const callSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    direction: z.string().optional(),
    status: z.string(),
    duration: z.number().optional(),
    transcript: z.string().nullable().optional(),
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
