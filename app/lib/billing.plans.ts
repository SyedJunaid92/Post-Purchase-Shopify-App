export const BILLING_PLAN = {
  STARTER_MONTHLY: "Starter Monthly",
  STARTER_ANNUAL: "Starter Annual",
  GROWTH_MONTHLY: "Growth Monthly",
  GROWTH_ANNUAL: "Growth Annual",
  SCALE_MONTHLY: "Scale Monthly",
  SCALE_ANNUAL: "Scale Annual",
} as const;

export type BillingPlanName = (typeof BILLING_PLAN)[keyof typeof BILLING_PLAN];
export type PlanTier = "starter" | "growth" | "scale";

export const ALL_BILLING_PLAN_NAMES = Object.values(BILLING_PLAN);

export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
};

export const PLAN_MARKETING = {
  starter: {
    name: "Starter",
    monthlyPrice: 25,
    description: "Launch your first post-purchase product offer.",
    features: [
      "Product offer flow",
      "Basic analytics",
      // "1 active test",
    ],
  },
  growth: {
    name: "Growth",
    monthlyPrice: 50,
    description: "Add subscription product offers after checkout.",
    features: [
      "Product offer flow",
      "Subscription product offer flow",
      "Analytics dashboard",
      // "Multiple active tests",
    ],
  },
  scale: {
    name: "Scale",
    monthlyPrice: 100,
    description: "Run every post-purchase flow type on your store.",
    features: [
      "All test types",
      "Quiz, survey & combo flows",
      "Advanced analytics",
      // "Unlimited active tests",
    ],
  },
} as const;

const TIER_BY_PLAN_NAME: Record<BillingPlanName, PlanTier> = {
  [BILLING_PLAN.STARTER_MONTHLY]: "starter",
  [BILLING_PLAN.STARTER_ANNUAL]: "starter",
  [BILLING_PLAN.GROWTH_MONTHLY]: "growth",
  [BILLING_PLAN.GROWTH_ANNUAL]: "growth",
  [BILLING_PLAN.SCALE_MONTHLY]: "scale",
  [BILLING_PLAN.SCALE_ANNUAL]: "scale",
};

export function annualPrice(monthlyPrice: number): number {
  return Math.round(monthlyPrice * 12 * 0.8);
}

/**
 * Fallback return URL used after Shopify billing approval, so the merchant
 * re-enters the embedded app through Admin (which restores shop/host params).
 *
 * The store handle is derived per-shop from the session; the app identifier is
 * the same for every store. We use the API key (client_id), which Admin resolves
 * to this app on any store with no per-store configuration. The preferred path
 * is `resolveBillingReturnUrl`, which reads the exact launch URL from Shopify.
 */
export function buildBillingReturnUrl(shop: string): string {
  const shopHandle = shop.replace(/\.myshopify\.com$/i, "");
  const appIdentifier =
    process.env.SHOPIFY_APP_HANDLE?.trim() ||
    process.env.SHOPIFY_API_KEY?.trim() ||
    "";
  return `https://admin.shopify.com/store/${shopHandle}/apps/${appIdentifier}/app/billing?subscribed=1`;
}

export function planNameForTier(
  tier: PlanTier,
  interval: "monthly" | "annual",
): BillingPlanName {
  const key = `${tier.toUpperCase()}_${interval === "monthly" ? "MONTHLY" : "ANNUAL"}` as keyof typeof BILLING_PLAN;
  return BILLING_PLAN[key];
}

export function resolvePlanTier(
  subscriptionName: string | null | undefined,
): PlanTier | null {
  if (!subscriptionName) return null;
  return TIER_BY_PLAN_NAME[subscriptionName as BillingPlanName] ?? null;
}

/** Growth and Scale plans include the full analytics dashboard route. */
export function hasAnalyticsAccess(tier: PlanTier | null): boolean {
  return tier === "growth" || tier === "scale";
}

export function analyticsAccessError(tier: PlanTier | null): string {
  const tierLabel = tier ? PLAN_TIER_LABELS[tier] : "current";
  return `Your ${tierLabel} plan includes basic dashboard metrics only. Upgrade to Growth to unlock the full analytics dashboard.`;
}
