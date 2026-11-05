import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getDashboardAnalyticsDetail,
  getUsdFxRates,
} from "./analytics.server";
import { getShopBillingRecord } from "./billing-records.server";
import { checkoutSettingsUrl, getPostPurchaseAppStatus } from "./post-purchase-setup.server";
import { isSupabaseConfigured } from "./supabase.server";
import { averageTraffic, countTestsByStatus } from "./tests.utils";
import { listTests } from "./tests.server";
import type { Test } from "./tests.server";

export type FunnelSummary = {
  counts: ReturnType<typeof countTestsByStatus>;
  recentTests: Test[];
  avgTraffic: string;
  dbError: string | null;
};

export type DashboardStats = {
  detail: Awaited<ReturnType<typeof getDashboardAnalyticsDetail>>;
  fx: { rates: Record<string, number>; asOf: string };
} | null;

export type DashboardApiResponse = {
  checkoutSettingsUrl: string;
  dbReady: boolean;
  funnelSummary: FunnelSummary;
  stats: DashboardStats;
  postPurchaseStatus: Awaited<ReturnType<typeof createPostPurchaseStatusPromise>>;
};

export function buildFunnelSummary(shop: string, dbReady: boolean): Promise<FunnelSummary> {
  if (!dbReady) {
    return Promise.resolve({
      counts: countTestsByStatus([]),
      recentTests: [],
      avgTraffic: "—",
      dbError: null,
    });
  }

  return listTests(shop)
    .then((tests) => ({
      counts: countTestsByStatus(tests),
      recentTests: [...tests]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5),
      avgTraffic: averageTraffic(tests),
      dbError: null,
    }))
    .catch((error) => {
      console.error("Dashboard listTests failed:", error);
      return {
        counts: countTestsByStatus([]),
        recentTests: [],
        avgTraffic: "—",
        dbError:
          error instanceof Error
            ? error.message
            : "Could not load funnels from the database",
      };
    });
}

export function buildStats(shop: string, dbReady: boolean): Promise<DashboardStats> {
  if (!dbReady) return Promise.resolve(null);

  return Promise.all([
    getDashboardAnalyticsDetail(shop).catch(() => null),
    getUsdFxRates().catch(() => null),
  ]).then(([detail, fx]) => (detail && fx ? { detail, fx } : null));
}

export function createPostPurchaseStatusPromise(
  admin: AdminApiContext,
  billingTest: boolean,
) {
  return getPostPurchaseAppStatus(admin, { billingTest }).catch((error) => {
    console.error("Post-purchase status check failed:", error);
    return billingTest
      ? { active: true, state: "active" as const, isDevStore: true }
      : { active: false, state: "unknown" as const };
  });
}

export async function loadDashboardApiData(request: Request): Promise<DashboardApiResponse> {
  const { session, admin } = await authenticate.admin(request);
  const dbReady = isSupabaseConfigured();
  const billingRecord = await getShopBillingRecord(session.shop);
  const billingTest = billingRecord?.isTest ?? false;

  const [funnelSummary, stats, postPurchaseStatus] = await Promise.all([
    buildFunnelSummary(session.shop, dbReady),
    buildStats(session.shop, dbReady),
    createPostPurchaseStatusPromise(admin, billingTest),
  ]);

  return {
    checkoutSettingsUrl: checkoutSettingsUrl(),
    dbReady,
    funnelSummary,
    stats,
    postPurchaseStatus,
  };
}
