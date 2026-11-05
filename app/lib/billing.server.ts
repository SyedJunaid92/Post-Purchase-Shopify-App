import type { BillingCheckResponseObject } from "@shopify/shopify-api";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { TestType } from "./tests.types";
import { authenticate } from "../shopify.server";
import {
  getShopBillingRecord,
  syncShopBillingFromCheck,
} from "./billing-records.server";
import {
  ALL_BILLING_PLAN_NAMES,
  PLAN_TIER_LABELS,
  buildBillingReturnUrl,
  resolvePlanTier,
  type PlanTier,
} from "./billing.plans";

export {
  ALL_BILLING_PLAN_NAMES,
  BILLING_PLAN,
  PLAN_MARKETING,
  PLAN_TIER_LABELS,
  annualPrice,
  planNameForTier,
  resolvePlanTier,
  buildBillingReturnUrl,
} from "./billing.plans";
export type { BillingPlanName, PlanTier } from "./billing.plans";

/**
 * Whether Shopify billing should use test charges for this shop.
 * Partner development stores must use test billing; live merchant stores use real billing.
 * @see https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopPlan#field-partnerDevelopment
 */
export async function resolveBillingIsTest(
  admin: AdminApiContext,
): Promise<boolean> {
  try {
    const response = await admin.graphql(`#graphql
      query BillingShopPlan {
        shop {
          plan {
            partnerDevelopment
          }
        }
      }
    `);
    const json = await response.json();
    return Boolean(json?.data?.shop?.plan?.partnerDevelopment);
  } catch (error) {
    console.error("resolveBillingIsTest failed — defaulting to live billing", error);
    return false;
  }
}

/**
 * Builds the URL the merchant returns to after approving a Shopify charge.
 *
 * Shopify performs a top-level navigation to this URL, so it must re-enter the
 * embedded app through Admin. We ask Shopify for the app's own launch URL on the
 * current store (`currentAppInstallation.launchUrl`), which is always correct for
 * any store and any app handle — no environment configuration required. If that
 * query fails for any reason, we fall back to a constructed Admin URL.
 */
export async function resolveBillingReturnUrl(
  admin: AdminApiContext,
  shop: string,
): Promise<string> {
  try {
    const response = await admin.graphql(`#graphql
      query AppLaunchUrl {
        currentAppInstallation {
          launchUrl
        }
      }
    `);
    const json = await response.json();
    const launchUrl: string | undefined =
      json?.data?.currentAppInstallation?.launchUrl;

    if (launchUrl) {
      const url = new URL(launchUrl);
      url.pathname = `${url.pathname.replace(/\/+$/, "")}/app/billing`;
      url.searchParams.set("subscribed", "1");
      return url.toString();
    }
  } catch (error) {
    console.error("resolveBillingReturnUrl: falling back", error);
  }

  return buildBillingReturnUrl(shop);
}

export function resolvePlanTierFromCheck(
  check: BillingCheckResponseObject,
): PlanTier | null {
  if (!check.hasActivePayment || !check.appSubscriptions?.length) return null;
  return resolvePlanTier(check.appSubscriptions[0]?.name);
}

export function allowedTestTypesForTier(tier: PlanTier | null): TestType[] {
  switch (tier) {
    case "starter":
      return ["product_offer"];
    case "growth":
      return ["product_offer", "trial_unlock"];
    case "scale":
      return ["product_offer", "quiz", "survey", "trial_unlock", "combo"];
    default:
      return [];
  }
}

export function isTestTypeAllowed(tier: PlanTier | null, type: TestType): boolean {
  return allowedTestTypesForTier(tier).includes(type);
}

export { hasAnalyticsAccess, analyticsAccessError } from "./billing.plans";

export function planLimitError(tier: PlanTier | null, type: TestType): string {
  const tierLabel = tier ? PLAN_TIER_LABELS[tier] : "current";
  const typeLabel = type.replace(/_/g, " ");
  return `Your ${tierLabel} plan does not include ${typeLabel} tests. Upgrade your plan on the Billing page.`;
}

function buildBillingState(
  check: BillingCheckResponseObject,
  billingTest: boolean,
) {
  const tier = resolvePlanTierFromCheck(check);

  return {
    check,
    tier,
    hasActivePayment: check.hasActivePayment,
    allowedTestTypes: allowedTestTypesForTier(tier),
    activeSubscription: check.appSubscriptions?.[0] ?? null,
    billingTest,
  };
}

type CachedBillingState = ReturnType<typeof buildBillingState> & {
  shop: string;
  billingRecord: Awaited<ReturnType<typeof getShopBillingRecord>>;
};

const billingStateCache = new Map<
  string,
  { expiresAt: number; state: CachedBillingState }
>();

const BILLING_CACHE_TTL_MS = 60_000;

function getCachedBillingState(shop: string): CachedBillingState | null {
  const cached = billingStateCache.get(shop);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached.state;
}

function setCachedBillingState(shop: string, state: CachedBillingState) {
  billingStateCache.set(shop, {
    expiresAt: Date.now() + BILLING_CACHE_TTL_MS,
    state,
  });
}

export async function getShopBillingState(request: Request) {
  const { billing, admin, session } = await authenticate.admin(request);
  const isTest = await resolveBillingIsTest(admin);

  try {
    const check = await billing.check({
      plans: ALL_BILLING_PLAN_NAMES,
      isTest,
    });

    await syncShopBillingFromCheck(session.shop, check, isTest);
    const billingRecord = await getShopBillingRecord(session.shop);

    return { ...buildBillingState(check, isTest), billingRecord };
  } catch (error) {
    // authenticate.admin throws Response redirects that must keep propagating.
    // billing.check throws a GraphQL Error (often "access denied" on
    // currentAppInstallation.activeSubscriptions for staff accounts). That
    // Error is what React Router sanitizes to "Unexpected Server Error".
    if (error instanceof Response) throw error;

    console.error(
      "billing.check failed; using the stored subscription instead",
      error,
    );

    const billingRecord = await getShopBillingRecord(session.shop);
    if (billingRecord) {
      return buildStateFromBillingRecord(session.shop, billingRecord);
    }

    return {
      ...buildBillingState(
        {
          hasActivePayment: false,
          appSubscriptions: [],
        } as BillingCheckResponseObject,
        isTest,
      ),
      billingRecord,
    };
  }
}

function buildStateFromBillingRecord(
  shop: string,
  billingRecord: NonNullable<Awaited<ReturnType<typeof getShopBillingRecord>>>,
): CachedBillingState {
  const isTest = billingRecord.isTest;
  const check = {
    hasActivePayment: billingRecord.hasActivePayment,
    appSubscriptions: billingRecord.subscriptionId
      ? [
          {
            id: billingRecord.subscriptionId,
            name: billingRecord.subscriptionName ?? "",
            status: billingRecord.subscriptionStatus ?? "ACTIVE",
            test: isTest,
          },
        ]
      : [],
  } as BillingCheckResponseObject;

  return {
    ...buildBillingState(check, isTest),
    shop,
    billingRecord,
  };
}

export async function requirePaidPlanContext(request: Request) {
  const url = new URL(request.url);
  const onBillingPage = url.pathname.startsWith("/app/billing");
  const { billing, redirect, admin, session } = await authenticate.admin(request);

  if (!onBillingPage) {
    const cached = getCachedBillingState(session.shop);
    if (cached) {
      if (!cached.hasActivePayment) {
        throw redirect("/app/billing");
      }
      return { state: cached, admin };
    }

    const billingRecord = await getShopBillingRecord(session.shop);
    if (billingRecord?.hasActivePayment) {
      const state = buildStateFromBillingRecord(session.shop, billingRecord);
      setCachedBillingState(session.shop, state);
      return { state, admin };
    }
  }

  const isTest = await resolveBillingIsTest(admin);

  const check = await billing.check({
    plans: ALL_BILLING_PLAN_NAMES,
    isTest,
  });

  await syncShopBillingFromCheck(session.shop, check, isTest);
  const billingRecord = await getShopBillingRecord(session.shop);

  if (!check.hasActivePayment && !onBillingPage) {
    throw redirect("/app/billing");
  }

  const state = {
    ...buildBillingState(check, isTest),
    shop: session.shop,
    billingRecord,
  };

  if (!onBillingPage) {
    setCachedBillingState(session.shop, state);
  }

  return { state, admin };
}

export async function requirePaidPlan(request: Request) {
  const { state } = await requirePaidPlanContext(request);
  return state;
}
