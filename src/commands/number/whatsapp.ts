import { addWhatsappToNumber, resolveNumberId } from "../../lib/ops/numbers.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type NumberWhatsappOptions = {
  /** Number ref: id, owned E.164, or nickname. */
  number: string;
  json: boolean;
};

export async function runNumberWhatsapp(opts: NumberWhatsappOptions): Promise<number> {
  try {
    const id = await resolveNumberId(opts.number);
    const n = await addWhatsappToNumber(id);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, number: n }));
      return 0;
    }
    console.log(`connecting WhatsApp.`);
    console.log(`  number:   ${n.number}`);
    console.log(`  id:       ${n.id}`);
    // The track's own status, not the number's: they are independent, and it is this
    // one the caller is waiting on.
    console.log(`  whatsapp: ${n.whatsapp?.status ?? "provisioning"}`);
    console.log(`\nsetup runs in the background. poll \`dial number list\` until whatsapp is ready.`);
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
