import postgres from "postgres";
import {
  computeAverageOrderValue,
  computeRevenuePerVisitor,
} from "./analytics.format";
import { type RevenueStats } from "./analytics.revenue.server";
import { enrichConversionEventData } from "./analytics.conversion.server";
import { getUsdFxRates } from "./fx.server";
import { REPORTING_CURRENCY, type FxSnapshot } from "./fx.constants";
import { cacheGet, cacheSet, REDIS_KEYS, REDIS_TTL } from "./redis.server";

export type { FxSnapshot };
export { REPORTING_CURRENCY, getUsdFxRates };

export type AnalyticsEventType =
  | "test_shown"
  | "test_skipped_traffic"
  | "step_viewed"
  | "question_answered"
  | "analyzing_completed"
  | "qualified"
  | "rejected"
  | "offer_accepted"
  | "offer_declined"
  | "product_auto_added"
  | "test_completed"
  | "extension_debug"
  | "offer_config_loaded"
  | "trigger_skipped"
  | "terms_accepted"
  | "trial_started";

export type AnalyticsEvent = {
  shop: string;
  testId?: string | null;
  referenceId?: string | null;
  sessionId?: string | null;
  eventType: AnalyticsEventType;
  eventData?: Record<string, unknown>;
};

export type DashboardStats = {
  totalShown: number;
  totalQualified: number;
  totalRejected: number;
  totalAccepted: number;
  totalDeclined: number;
  totalAutoAdded: number;
  totalCompleted: number;
  totalApiChecks: number;
};

export type ComboVariantStats = {
  variant: string;
  shown: number;
  converted: number;
  declined: number;
  completed: number;
};

export type FunnelStepStats = {
  step: string;
  count: number;
};

export type FunnelTypeStats = {
  funnelType: string;
  shown: number;
  converted: number;
  declined: number;
  qualified: number;
  rejected: number;
};

export type TestAnalyticsSummary = {
  testId: string;
  shown: number;
  converted: number;
  conversionRate: number;
  totalRevenue: number;
  revenuePerVisitor: number;
  averageOrderValue: number;
  currency: typeof REPORTING_CURRENCY;
};

export type TestAnalyticsDetail = DashboardStats & {
  conversionRate: number;
  totalRevenue: number;
  revenuePerVisitor: number;
  averageOrderValue: number;
  ordersWithRevenue: number;
  currency: typeof REPORTING_CURRENCY;
  fxAsOf: string;
  comboSplit: ComboVariantStats[];
  funnelSteps: FunnelStepStats[];
  funnelTypeBreakdown?: FunnelTypeStats[];
};

/** Real checkout reference IDs are long; exclude dev/test pings. */
export function isRealCheckoutReference(
  referenceId: string | null | undefined,
): boolean {
  if (!referenceId) return false;
  const id = referenceId.trim();
  if (id.length < 12) return false;
  if (/^test/i.test(id)) return false;
  return true;
}

let sql: ReturnType<typeof postgres> | null = null;

function getSql() {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");
  sql = postgres(url, { prepare: false });
  return sql;
}

export function getAnalyticsSql() {
  return getSql();
}


async function readDaily(
  shop: string,
  scope: { since?: Date | null; testIds?: string[] | null; testId?: string } = {},
) {
  const { readAnalyticsDaily } = await import("./analytics-daily.server");
  return readAnalyticsDaily(shop, {
    since: scope.since ?? null,
    testIds: scope.testId
      ? [scope.testId]
      : scope.testIds === undefined
        ? null
        : scope.testIds,
  });
}

function dashboardStatsFromDaily(
  row: Awaited<ReturnType<typeof readDaily>>,
): DashboardStats {
  return {
    totalShown: row.shown,
    totalQualified: row.qualified,
    totalRejected: row.rejected,
    totalAccepted: row.accepted,
    totalDeclined: row.declined,
    totalAutoAdded: row.autoAdded,
    totalCompleted: row.completed,
    totalApiChecks: row.apiChecks,
  };
}

function revenueFromDaily(
  row: Awaited<ReturnType<typeof readDaily>>,
): RevenueStats {
  return {
    totalRevenue: row.revenueUsd,
    ordersWithRevenue: row.ordersWithRevenue,
    currency: REPORTING_CURRENCY,
    fxAsOf: new Date().toISOString().slice(0, 10),
  };
}

export async function getRevenueStats(
  shop: string,
  testId?: string,
): Promise<RevenueStats> {
  return revenueFromDaily(await readDaily(shop, { testId }));
}

function attachRevenueMetrics<T extends { totalShown: number }>(
  base: T,
  revenue: RevenueStats,
): T & {
  totalRevenue: number;
  revenuePerVisitor: number;
  averageOrderValue: number;
  ordersWithRevenue: number;
  currency: typeof REPORTING_CURRENCY;
  fxAsOf: string;
} {
  return {
    ...base,
    totalRevenue: revenue.totalRevenue,
    revenuePerVisitor: computeRevenuePerVisitor(
      revenue.totalRevenue,
      base.totalShown,
    ),
    averageOrderValue: computeAverageOrderValue(
      revenue.totalRevenue,
      revenue.ordersWithRevenue,
    ),
    ordersWithRevenue: revenue.ordersWithRevenue,
    currency: REPORTING_CURRENCY,
    fxAsOf: revenue.fxAsOf,
  };
}

export async function deleteAnalyticsForShop(shop: string): Promise<void> {
  const db = getSql();
  await db`delete from analytics_events where shop = ${shop}`;
  const { deleteAnalyticsDailyForShop } = await import("./analytics-daily.server");
  await deleteAnalyticsDailyForShop(shop).catch((error) => {
    console.error("deleteAnalyticsDailyForShop:", error);
  });
}

export async function logAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  const db = getSql();
  const eventData = await enrichConversionEventData({
    shop: event.shop,
    testId: event.testId,
    referenceId: event.referenceId,
    eventType: event.eventType,
    eventData: event.eventData,
  });
  await db`
    insert into analytics_events (
      shop, test_id, reference_id, session_id, event_type, event_data
    ) values (
      ${event.shop},
      ${event.testId ?? null},
      ${event.referenceId ?? null},
      ${event.sessionId ?? null},
      ${event.eventType},
      ${db.json(eventData as Record<string, never>)}
    )
  `;
}

export async function getDashboardStats(shop: string): Promise<DashboardStats> {
  return dashboardStatsFromDaily(await readDaily(shop));
}

export async function getTestAnalytics(
  shop: string,
  testId: string,
): Promise<DashboardStats> {
  return dashboardStatsFromDaily(await readDaily(shop, { testId }));
}

export async function getComboSplitStats(
  shop: string,
  testId: string,
): Promise<ComboVariantStats[]> {
  const daily = await readDaily(shop, { testId });
  return daily.comboSplit.map((row) => ({
    variant: row.variant,
    shown: row.shown,
    converted: row.converted + (row.qualified ?? 0),
    declined: row.declined,
    completed: row.completed,
  }));
}

export async function getFunnelStepStats(
  shop: string,
  testId: string,
): Promise<FunnelStepStats[]> {
  const daily = await readDaily(shop, { testId });
  return daily.funnelSteps.slice(0, 12);
}

export async function getFunnelTypeBreakdown(
  shop: string,
  testId?: string,
): Promise<FunnelTypeStats[]> {
  const daily = await readDaily(shop, { testId });
  return daily.funnelTypes;
}

export async function getTestAnalyticsSummaries(
  shop: string,
): Promise<TestAnalyticsSummary[]> {
  const daily = await readDaily(shop);
  return daily.byTest.map((row) => ({
    testId: row.testId,
    shown: row.shown,
    converted: row.converted,
    conversionRate:
      row.shown > 0 ? Math.min(100, Math.round((row.converted / row.shown) * 100)) : 0,
    totalRevenue: row.revenueUsd,
    revenuePerVisitor: computeRevenuePerVisitor(row.revenueUsd, row.shown),
    averageOrderValue: computeAverageOrderValue(row.revenueUsd, row.ordersWithRevenue),
    currency: REPORTING_CURRENCY,
  }));
}

export async function getTestAnalyticsDetail(
  shop: string,
  testId: string,
  options?: { isCombo?: boolean; testType?: string },
): Promise<TestAnalyticsDetail> {
  try {
    return await loadTestAnalyticsDetail(shop, testId, options);
  } catch (error) {
    console.error("getTestAnalyticsDetail:", error);
    const base = await getTestAnalytics(shop, testId).catch(() => ({
      totalShown: 0,
      totalQualified: 0,
      totalRejected: 0,
      totalAccepted: 0,
      totalDeclined: 0,
      totalAutoAdded: 0,
      totalCompleted: 0,
      totalApiChecks: 0,
    }));
    return {
      ...base,
      conversionRate:
        base.totalShown > 0
          ? Math.min(
              100,
              Math.round((base.totalAccepted / base.totalShown) * 100),
            )
          : 0,
      totalRevenue: 0,
      revenuePerVisitor: 0,
      averageOrderValue: 0,
      ordersWithRevenue: 0,
      currency: REPORTING_CURRENCY,
      fxAsOf: new Date().toISOString().slice(0, 10),
      comboSplit: [],
      funnelSteps: [],
      funnelTypeBreakdown: [],
    };
  }
}

async function loadTestAnalyticsDetail(
  shop: string,
  testId: string,
  options?: { isCombo?: boolean; testType?: string },
): Promise<TestAnalyticsDetail> {
  const [base, revenue, comboSplit, funnelSteps, funnelTypeBreakdown] =
    await Promise.all([
      getTestAnalytics(shop, testId),
      getRevenueStats(shop, testId),
      options?.isCombo ? getComboSplitStats(shop, testId) : Promise.resolve([]),
      getFunnelStepStats(shop, testId),
      options?.isCombo
        ? getFunnelTypeBreakdown(shop, testId)
        : Promise.resolve([]),
    ]);

  const conversionRate =
    base.totalShown > 0
      ? Math.min(100, Math.round((base.totalAccepted / base.totalShown) * 100))
      : 0;

  return {
    ...attachRevenueMetrics(base, revenue),
    conversionRate,
    comboSplit,
    funnelSteps,
    funnelTypeBreakdown,
  };
}

export async function getDashboardAnalyticsDetail(
  shop: string,
): Promise<TestAnalyticsDetail> {
  const cached = await cacheGet<TestAnalyticsDetail>(REDIS_KEYS.dashboard(shop));
  if (cached && typeof cached.totalShown === "number") {
    return cached;
  }

  try {
    const detail = await loadDashboardAnalyticsDetail(shop);
    void cacheSet(REDIS_KEYS.dashboard(shop), detail, REDIS_TTL.dashboard);
    return detail;
  } catch (error) {
    console.error("getDashboardAnalyticsDetail:", error);
    const base = await getDashboardStats(shop).catch(() => ({
      totalShown: 0,
      totalQualified: 0,
      totalRejected: 0,
      totalAccepted: 0,
      totalDeclined: 0,
      totalAutoAdded: 0,
      totalCompleted: 0,
      totalApiChecks: 0,
    }));
    return {
      ...base,
      conversionRate:
        base.totalShown > 0
          ? Math.min(
              100,
              Math.round((base.totalAccepted / base.totalShown) * 100),
            )
          : 0,
      totalRevenue: 0,
      revenuePerVisitor: 0,
      averageOrderValue: 0,
      ordersWithRevenue: 0,
      currency: REPORTING_CURRENCY,
      fxAsOf: new Date().toISOString().slice(0, 10),
      comboSplit: [],
      funnelSteps: [],
      funnelTypeBreakdown: [],
    };
  }
}

async function loadDashboardAnalyticsDetail(
  shop: string,
): Promise<TestAnalyticsDetail> {
  const daily = await readDaily(shop);
  const base = dashboardStatsFromDaily(daily);
  const conversionRate =
    base.totalShown > 0
      ? Math.min(100, Math.round((base.totalAccepted / base.totalShown) * 100))
      : 0;

  return {
    ...attachRevenueMetrics(base, revenueFromDaily(daily)),
    conversionRate,
    comboSplit: daily.comboSplit.map(({ variant, shown, converted, declined, completed }) => ({
      variant,
      shown,
      converted,
      declined,
      completed,
    })),
    funnelSteps: daily.funnelSteps.slice(0, 8),
    funnelTypeBreakdown: daily.funnelTypes,
  };
}


export type AnalyticsScope = {
  /** When null, include all tests. When empty, return no rows. */
  testIds: string[] | null;
  since: Date | null;
};

function scopeHasData(scope: AnalyticsScope): boolean {
  return scope.testIds === null || scope.testIds.length > 0;
}

function emptyDashboardStats(): DashboardStats {
  return {
    totalShown: 0,
    totalQualified: 0,
    totalRejected: 0,
    totalAccepted: 0,
    totalDeclined: 0,
    totalAutoAdded: 0,
    totalCompleted: 0,
    totalApiChecks: 0,
  };
}

export async function getFilteredDashboardAnalyticsDetail(
  shop: string,
  scope: AnalyticsScope,
): Promise<TestAnalyticsDetail> {
  if (!scopeHasData(scope)) {
    return {
      ...emptyDashboardStats(),
      conversionRate: 0,
      totalRevenue: 0,
      revenuePerVisitor: 0,
      averageOrderValue: 0,
      ordersWithRevenue: 0,
      currency: REPORTING_CURRENCY,
      fxAsOf: new Date().toISOString().slice(0, 10),
      comboSplit: [],
      funnelSteps: [],
      funnelTypeBreakdown: [],
    };
  }

  const daily = await readDaily(shop, { since: scope.since, testIds: scope.testIds });
  const base = dashboardStatsFromDaily(daily);
  const conversionRate =
    base.totalShown > 0
      ? Math.min(100, Math.round((base.totalAccepted / base.totalShown) * 100))
      : 0;

  return {
    ...attachRevenueMetrics(base, revenueFromDaily(daily)),
    conversionRate,
    comboSplit: daily.comboSplit.map(({ variant, shown, converted, declined, completed }) => ({
      variant,
      shown,
      converted,
      declined,
      completed,
    })),
    funnelSteps: daily.funnelSteps.slice(0, 8),
    funnelTypeBreakdown: daily.funnelTypes,
  };
}

export async function getScopedTestAnalyticsSummaries(
  shop: string,
  scope: AnalyticsScope,
): Promise<TestAnalyticsSummary[]> {
  if (!scopeHasData(scope)) return [];
  const daily = await readDaily(shop, { since: scope.since, testIds: scope.testIds });
  return daily.byTest.map((row) => ({
    testId: row.testId,
    shown: row.shown,
    converted: row.converted,
    conversionRate:
      row.shown > 0 ? Math.min(100, Math.round((row.converted / row.shown) * 100)) : 0,
    totalRevenue: row.revenueUsd,
    revenuePerVisitor: computeRevenuePerVisitor(row.revenueUsd, row.shown),
    averageOrderValue: computeAverageOrderValue(row.revenueUsd, row.ordersWithRevenue),
    currency: REPORTING_CURRENCY,
  }));
}
