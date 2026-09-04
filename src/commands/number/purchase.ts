import { purchaseNumber } from "../../lib/ops/numbers.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type NumberPurchaseOptions = {
  inboundInstruction: string;
  explicitProgrammaticConsent: string;
  inboundVoiceGender?: string;
  inboundLanguage?: string;
  areaCode?: string;
  includeImessage?: boolean;
  /** Also connect WhatsApp. Only valid alongside --imessage. */
  whatsapp?: boolean;
  /** Whether calling is switched on for the new number; undefined → on. */
  callingEnabled?: boolean;
  json: boolean;
};

export async function runNumberPurchase(opts: NumberPurchaseOptions): Promise<number> {
  // WhatsApp rides on an iMessage line, so there is no standard-number combination to
  // ask for. Refused here, before spending anything, and naming the requirement rather
  // than relaying a 400 the caller has to map back to their flags.
  if (opts.whatsapp && !opts.includeImessage) {
    console.error(
      "error: --whatsapp requires --include-imessage (WhatsApp is a channel on an iMessage line).",
    );
    return 2;
  }
  try {
    const n = await purchaseNumber({
      inboundInstruction: opts.inboundInstruction,
      explicitProgrammaticConsent: opts.explicitProgrammaticConsent,
      inboundVoiceGender: opts.inboundVoiceGender,
      inboundLanguage: opts.inboundLanguage,
      areaCode: opts.areaCode,
      includeImessage: opts.includeImessage,
      callingEnabled: opts.callingEnabled,
      whatsapp: opts.whatsapp,
    });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, number: n }));
    } else {
      console.log(`purchased.`);
      console.log(`  number:   ${n.number}`);
      console.log(`  id:       ${n.id}`);
      console.log(`  country:  ${n.country}`);
      // Only worth a line when it isn't the default — a messaging-only line is
      // a surprising thing to discover later.
      if (n.callingEnabled === false) console.log(`  calling:  off (messaging only)`);
      // iMessage numbers provision asynchronously: the number is returned right
      // away in setupStatus "provisioning". Tell the user to poll before using it.
      if (opts.includeImessage) {
        console.log(
          `  status:   ${n.setupStatus ?? "provisioning"} — run \`dial number list\` until it's "ready" before sending or calling from it.`,
        );
      }
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
