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
      const renewal = s.cancelAtPeriodEnd ? `cancels ${s.periodEnd}` : `renews ${s.periodEnd}`;
      console.log(`plan:      subscribed (${s.interval}, ${numbers}) — ${renewal}`);
    } else {
      console.log(`plan:      pay-as-you-go`);
    }
    if (billing.numbers.length > 0) {
      console.log(`numbers:`);
      for (const n of billing.numbers) {
        const mode = n.mode === "FIXED" ? "subscription" : "pay-as-you-go";
        const nick = n.nickname ? `  "${n.nickname}"` : "";
        console.log(`  ${n.number}${nick}  ${mode}  id=${n.id}`);
      }
    }
    if (billing.deposits.length > 0) {
      console.log(`recent credits:`);
      for (const d of billing.deposits) {
        console.log(`  ${d.createdAt}  +${usd(d.amountCents)}  (${d.kind})`);
      }
    }
    if (billing.paymentMethods.length > 0) {
      console.log(`payment methods:`);
      for (const p of billing.paymentMethods) {
        const tag = p.isDefault ? "  (default)" : "";
        if (p.type === "card") {
          const exp = `${String(p.expMonth).padStart(2, "0")}/${String(p.expYear).slice(-2)}`;
          console.log(`  ${p.brand} •••• ${p.last4}  exp ${exp}${tag}`);
        } else {
          console.log(`  ${p.type}${p.email ? `  ${p.email}` : ""}${tag}`);
        }
      }
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
