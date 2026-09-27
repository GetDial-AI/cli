import { addWhatsappToNumber, resolveNumberId } from "../../lib/ops/numbers.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type NumberWhatsappOptions = {
  /** Number ref: id, owned E.164, or nickname. */
  number: string;
  json: boolean;
};

/**
 * What to do after connecting: registration takes minutes, then the number warms up
 * (`warming_up`) for about 6 hours before it's `ready`, so the wait needs a long timeout.
 */
export function whatsappConnectNextStep(numberId: string): string {
  return (
    `setup runs in the background: WhatsApp registers in a few minutes, then warms up for about 6 hours ` +
    `(status "warming_up") before it's ready. wait for it with a long timeout:\n` +
    `  dial wait-for number.status_changed -f status=ready -f phoneNumberId=${numberId} --timeout 28800`
  );
}

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
    console.log(`\n${whatsappConnectNextStep(n.id)}`);
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
