import { purchaseNumber } from "../../lib/ops/numbers.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type NumberPurchaseOptions = {
  inboundInstruction: string;
  inboundVoiceGender?: string;
  areaCode?: string;
  json: boolean;
};

export async function runNumberPurchase(opts: NumberPurchaseOptions): Promise<number> {
  try {
    const n = await purchaseNumber({
      inboundInstruction: opts.inboundInstruction,
      inboundVoiceGender: opts.inboundVoiceGender,
      areaCode: opts.areaCode,
    });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, number: n }));
    } else {
      console.log(`purchased.`);
      console.log(`  number:   ${n.number}`);
      console.log(`  id:       ${n.id}`);
      console.log(`  country:  ${n.country}`);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
