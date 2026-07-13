import { apiGet } from "../api.ts";
import { maybeAuth } from "./auth.ts";
import { DialError } from "./errors.ts";

// `dial billing` — read-only account billing. Wraps GET /api/v1/billing. Billing
// management (subscribe, top up, cancel) is a browser/dashboard flow, not a CLI verb.

export type BillingInterval = "monthly" | "annual";

export type BillingSubscription = {
  periodStart: string;
  periodEnd: string;
  quantity: number;
  interval: BillingInterval;
  cancelAtPeriodEnd: boolean;
};
export type BillingNumber = { id: string; number: string; nickname: string | null; mode: "PAYG" | "FIXED" };
export type BillingDeposit = {
  createdAt: string;
  amountCents: number;
  kind: "card" | "welcome" | "manual";
  /** Stripe invoice id backing this deposit (card top-ups only; null otherwise). */
  invoiceId: string | null;
};
export type BillingPricing = { monthlyCents: number; annualCents: number };
export type BillingPaymentMethod = {
  id: string;
  type: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  email: string | null;
  isDefault: boolean;
};
export type Billing = {
  balanceCents: number;
  /**
   * ISO date-time when all the account's numbers will be released for non-payment
   * (end of the 30-day grace period), or null when nothing is at risk. Non-null
   * only for a pay-as-you-go account whose balance is negative.
   */
  numbersReleaseAt: string | null;
  subscription: BillingSubscription | null;
  numbers: BillingNumber[];
  /** Recent wallet credits (top-ups, welcome credit, manual grants), newest first. */
  deposits: BillingDeposit[];
  pricing: BillingPricing;
  paymentMethods: BillingPaymentMethod[];
};

export async function getBilling(): Promise<Billing> {
  const auth = maybeAuth();
  const res = await apiGet<Billing>("/api/v1/billing", auth?.apiKey);
  if (!res.ok) throw new DialError("billing_failed", res.error, res.status);
  return res.data;
}
