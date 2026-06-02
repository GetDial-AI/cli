import { setNumberProperties } from "../../lib/ops/numbers.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type NumberSetOptions = {
  number: string;
  inboundInstruction: string;
  json: boolean;
};

export async function runNumberSet(opts: NumberSetOptions): Promise<number> {
  try {
    const n = await setNumberProperties({ number: opts.number, inboundInstruction: opts.inboundInstruction });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, number: n }));
    } else {
      console.log(`updated.`);
      console.log(`  number:               ${n.number}`);
      console.log(`  id:                   ${n.id}`);
      console.log(`  inbound instruction:  ${n.inboundInstruction ?? ""}`);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
