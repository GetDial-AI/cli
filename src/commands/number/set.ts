import { setNumberProperties } from "../../lib/ops/numbers.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type NumberSetOptions = {
  number: string;
  inboundInstruction?: string;
  /** "male"/"female"; an empty string clears it (reverts to the default, female). */
  inboundVoiceGender?: string;
  /** BCP-47 tag pinning inbound calls to one language; an empty string clears it (reverts to per-call detection). */
  inboundLanguage?: string;
  /** Human-readable label for the number; an empty string clears it. */
  nickname?: string;
  /**
   * Per-number call duration cap in seconds, applied as a hard ceiling to both
   * inbound and outbound calls on the number.
   * `null` clears the cap; `undefined` leaves it unchanged.
   */
  maxCallDurationSeconds?: number | null;
  json: boolean;
};

export async function runNumberSet(opts: NumberSetOptions): Promise<number> {
  try {
    const n = await setNumberProperties({
      number: opts.number,
      inboundInstruction: opts.inboundInstruction,
      ...(opts.inboundVoiceGender !== undefined
        ? { inboundVoiceGender: opts.inboundVoiceGender }
        : {}),
      ...(opts.inboundLanguage !== undefined ? { inboundLanguage: opts.inboundLanguage } : {}),
      ...(opts.nickname !== undefined ? { nickname: opts.nickname } : {}),
      ...(opts.maxCallDurationSeconds !== undefined
        ? { maxCallDurationSeconds: opts.maxCallDurationSeconds }
        : {}),
    });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, number: n }));
    } else {
      console.log(`updated.`);
      console.log(`  number:                ${n.number}`);
      console.log(`  id:                    ${n.id}`);
      console.log(`  nickname:              ${n.nickname ?? ""}`);
      console.log(`  inbound instruction:   ${n.inboundInstruction ?? ""}`);
      console.log(`  inbound voice gender:  ${n.inboundVoiceGender ?? ""}`);
      console.log(`  inbound language:      ${n.inboundLanguage ?? ""}`);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
