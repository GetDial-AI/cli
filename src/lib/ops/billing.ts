import { apiGet } from "../api.ts";
import { requireAuth } from "./auth.ts";
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
export type BillingUsageRow = {
  occurredAt: string;
  fareName: string;
  number: string | null;
  billedQuantity: number;
  totalCents: number;
  attribution: "wallet" | "entitlement";
};
export type BillingDeposit = {
  createdAt: string;
  amountCents: number;
  kind: "card" | "welcome" | "manual";
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
  subscription: BillingSubscription | null;
  numbers: BillingNumber[];
  recentUsage: BillingUsageRow[];
  deposits: BillingDeposit[];
  pricing: BillingPricing;
  paymentMethods: BillingPaymentMethod[];
};

export async function getBilling(): Promise<Billing> {
  const auth = requireAuth();
  const res = await apiGet<Billing>("/api/v1/billing", auth.apiKey);
  if (!res.ok) throw new DialError("billing_failed", res.error, res.status);
  return res.data;
}
