import { getBilling } from "../lib/ops/billing.ts";
import { isDialError } from "../lib/ops/errors.ts";
import { printDialError } from "../lib/cli-error.ts";

export type BillingOptions = { json: boolean };

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export async function runBilling(opts: BillingOptions): Promise<number> {
  try {
    const billing = await getBilling();
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, ...billing }));
      return 0;
    }
    console.log(`balance:   ${usd(billing.balanceCents)}`);
    if (billing.subscription) {
      const s = billing.subscription;
      const numbers = `${s.quantity} number${s.quantity === 1 ? "" : "s"}`;
      console.log(`plan:      subscribed (${s.interval}, ${numbers}) — renews ${s.periodEnd}`);
    } else {
      console.log(`plan:      pay-as-you-go`);
    }
    if (billing.numbers.length > 0) {
      console.log(`numbers:`);
      for (const n of billing.numbers) {
        console.log(`  ${n.number}  ${n.mode === "FIXED" ? "subscription" : "pay-as-you-go"}  id=${n.id}`);
      }
    }
    if (billing.recentUsage.length > 0) {
      console.log(`recent usage:`);
      for (const u of billing.recentUsage) {
        console.log(`  ${u.occurredAt}  ${u.fareName}  x${u.billedQuantity}  ${usd(u.totalCents)}  (${u.attribution})`);
      }
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
