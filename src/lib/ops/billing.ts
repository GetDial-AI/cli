import { apiGet } from "../api.ts";
import { requireAuth } from "./auth.ts";
import { DialError } from "./errors.ts";

// `dial billing` — read-only account billing. Wraps GET /api/v1/billing.

export type BillingSubscription = {
  periodStart: string;
  periodEnd: string;
  quantity: number;
  interval: "monthly" | "annual";
};
export type BillingNumber = { id: string; number: string; mode: "PAYG" | "FIXED" };
export type BillingUsageRow = {
  occurredAt: string;
  fareName: string;
  billedQuantity: number;
  totalCents: number;
  attribution: "wallet" | "entitlement";
};
export type Billing = {
  balanceCents: number;
  subscription: BillingSubscription | null;
  numbers: BillingNumber[];
  recentUsage: BillingUsageRow[];
};

export async function getBilling(): Promise<Billing> {
  const auth = requireAuth();
  const res = await apiGet<Billing>("/api/v1/billing", auth.apiKey);
  if (!res.ok) throw new DialError("billing_failed", res.error, res.status);
  return res.data;
}
