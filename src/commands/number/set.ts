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
  /** iMessage display first name; an empty string clears it. iMessage numbers only. */
  firstName?: string;
  /** iMessage display last name; an empty string clears it. iMessage numbers only. */
  lastName?: string;
  /** iMessage avatar photo: local image path (uploaded) or public image URL (fetched server-side). Replace-only. */
  avatar?: string;
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
      ...(opts.firstName !== undefined ? { firstName: opts.firstName } : {}),
      ...(opts.lastName !== undefined ? { lastName: opts.lastName } : {}),
      ...(opts.avatar !== undefined ? { avatar: opts.avatar } : {}),
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
      const hasIdentity = n.firstName != null || n.lastName != null || n.avatarUrl != null;
      if (hasIdentity) {
        console.log(
          `  display name:          ${[n.firstName, n.lastName].filter(Boolean).join(" ")}`,
        );
        console.log(`  avatar:                ${n.avatarUrl ?? ""}`);
      }
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
