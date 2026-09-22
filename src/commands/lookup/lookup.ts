import { lookupNumber } from "../../lib/ops/lookup.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type LookupOptions = { json: boolean };

/** Channels in the order they are printed, with the label each one shows as. */
const CHANNEL_LABELS: Record<string, string> = {
  imessage: "iMessage",
  whatsapp: "WhatsApp",
};

/**
 * How one channel's verdict reads.
 *
 * Three states, not two. `null` means Dial did not answer for that channel — today only because the
 * account holds no WhatsApp number of its own — and printing it as `no` would say the number is
 * unreachable, which is the one thing it does not mean. A `?? "no"` here is the whole bug.
 */
function verdictOf(supported: unknown): string {
  if (supported === true) return "yes";
  if (supported === false) return "no";
  return "unknown";
}

export async function runLookup(number: string, opts: LookupOptions): Promise<number> {
  try {
    const result = await lookupNumber(number);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, ...result }));
      return 0;
    }
    console.log(result.number);
    for (const [channel, supported] of Object.entries(result.supports)) {
      // A channel added to the API after this CLI shipped still prints, under its
      // raw key — reporting an unknown channel is better than hiding it.
      const label = CHANNEL_LABELS[channel] ?? channel;
      console.log(`  ${label.padEnd(9)} ${verdictOf(supported)}`);
    }
    return 0;
  } catch (e) {
    // A lookup that could not be completed exits non-zero rather than printing
    // "no": the two mean different things, and only one is worth retrying.
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
