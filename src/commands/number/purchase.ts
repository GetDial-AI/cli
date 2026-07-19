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
  json: boolean;
};

export async function runNumberPurchase(opts: NumberPurchaseOptions): Promise<number> {
  try {
    const n = await purchaseNumber({
      inboundInstruction: opts.inboundInstruction,
      explicitProgrammaticConsent: opts.explicitProgrammaticConsent,
      inboundVoiceGender: opts.inboundVoiceGender,
      inboundLanguage: opts.inboundLanguage,
      areaCode: opts.areaCode,
      includeImessage: opts.includeImessage,
    });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, number: n }));
    } else {
      console.log(`purchased.`);
      console.log(`  number:   ${n.number}`);
      console.log(`  id:       ${n.id}`);
      console.log(`  country:  ${n.country}`);
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
