import postgres from "postgres";
import {
  computeAverageOrderValue,
  computeRevenuePerVisitor,
} from "./analytics.format";
import {
  buildRevenueStats,
  mapConversionOrderRows,
  summarizeRevenueByTest,
  type RevenueStats,
} from "./analytics.revenue.server";
import { enrichConversionEventData, resolveConversionOrderRow } from "./analytics.conversion.server";
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

const REAL_CHECKOUT_FILTER = `length(coalesce(reference_id, '')) >= 12 and coalesce(reference_id, '') !~ '^test'`;

async function fetchConversionOrderRows(
  shop: string,
  testId?: string,
): Promise<
  Array<{
    reference_id: string;
    test_id: string | null;
    amount: string | null;
    currency: string | null;
    amount_usd: string | null;
  }>
> {
  const db = getSql();

  const rows = testId
    ? await db<
        {
          reference_id: string;
          test_id: string | null;
          event_type: string;
          event_data: unknown;
        }[]
      >`
        select distinct on (reference_id)
          reference_id,
          test_id,
          event_type,
          event_data
        from analytics_events
        where shop = ${shop}
          and test_id = ${testId}
          and event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        order by reference_id, created_at desc
      `
    : await db<
        {
          reference_id: string;
          test_id: string | null;
          event_type: string;
          event_data: unknown;
        }[]
      >`
        select distinct on (reference_id)
          reference_id,
          test_id,
          event_type,
          event_data
        from analytics_events
        where shop = ${shop}
          and event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        order by reference_id, created_at desc
      `;

  try {
    return await Promise.all(
      rows.map((row) => resolveConversionOrderRow(shop, row)),
    );
  } catch (error) {
    console.error("fetchConversionOrderRows failed:", error);
    return [];
  }
}

export async function getRevenueStats(
  shop: string,
  testId?: string,
): Promise<RevenueStats> {
  const rows = mapConversionOrderRows(await fetchConversionOrderRows(shop, testId));
  return buildRevenueStats(rows);
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

type StatsRow = {
  total_shown: string;
  total_qualified: string;
  total_rejected: string;
  total_accepted: string;
  total_declined: string;
  total_auto_added: string;
  total_completed: string;
  total_api_checks: string;
};

function mapStatsRow(row: StatsRow | undefined): DashboardStats {
  return {
    totalShown: parseInt(row?.total_shown ?? "0", 10),
    totalQualified: parseInt(row?.total_qualified ?? "0", 10),
    totalRejected: parseInt(row?.total_rejected ?? "0", 10),
    totalAccepted: parseInt(row?.total_accepted ?? "0", 10),
    totalDeclined: parseInt(row?.total_declined ?? "0", 10),
    totalAutoAdded: parseInt(row?.total_auto_added ?? "0", 10),
    totalCompleted: parseInt(row?.total_completed ?? "0", 10),
    totalApiChecks: parseInt(row?.total_api_checks ?? "0", 10),
  };
}

export async function getDashboardStats(shop: string): Promise<DashboardStats> {
  const db = getSql();
  const rows = await db<StatsRow[]>`
    select
      count(distinct reference_id) filter (
        where event_type = 'test_shown'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_shown,
      count(distinct reference_id) filter (
        where event_type = 'qualified'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_qualified,
      count(distinct reference_id) filter (
        where event_type = 'rejected'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_rejected,
      count(distinct reference_id) filter (
        where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_accepted,
      count(distinct reference_id) filter (
        where event_type = 'offer_declined'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_declined,
      count(distinct reference_id) filter (
        where event_type = 'product_auto_added'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_auto_added,
      count(distinct reference_id) filter (
        where event_type = 'test_completed'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_completed,
      count(distinct reference_id) filter (
        where event_type = 'offer_config_loaded'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_api_checks
    from analytics_events
    where shop = ${shop}
  `;
  return mapStatsRow(rows[0]);
}

export async function getTestAnalytics(
  shop: string,
  testId: string,
): Promise<DashboardStats> {
  const db = getSql();
  const rows = await db<StatsRow[]>`
    select
      count(distinct reference_id) filter (
        where event_type = 'test_shown'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_shown,
      count(distinct reference_id) filter (
        where event_type = 'qualified'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_qualified,
      count(distinct reference_id) filter (
        where event_type = 'rejected'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_rejected,
      count(distinct reference_id) filter (
        where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_accepted,
      count(distinct reference_id) filter (
        where event_type = 'offer_declined'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_declined,
      count(distinct reference_id) filter (
        where event_type = 'product_auto_added'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_auto_added,
      count(distinct reference_id) filter (
        where event_type = 'test_completed'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_completed,
      count(distinct reference_id) filter (
        where event_type = 'offer_config_loaded'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_api_checks
    from analytics_events
    where shop = ${shop} and test_id = ${testId}
  `;
  return mapStatsRow(rows[0]);
}

export async function getComboSplitStats(
  shop: string,
  testId: string,
): Promise<ComboVariantStats[]> {
  const db = getSql();
  const rows = await db<
    {
      variant: string;
      shown: string;
      converted: string;
      declined: string;
      completed: string;
    }[]
  >`
    select
      coalesce(event_data->>'comboVariant', 'unknown') as variant,
      count(distinct reference_id) filter (
        where event_type = 'test_shown'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as shown,
      count(distinct reference_id) filter (
        where event_type in ('offer_accepted', 'trial_started', 'product_auto_added', 'qualified')
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as converted,
      count(distinct reference_id) filter (
        where event_type = 'offer_declined'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as declined,
      count(distinct reference_id) filter (
        where event_type = 'test_completed'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as completed
    from analytics_events
    where shop = ${shop}
      and test_id = ${testId}
      and event_data->>'comboVariant' is not null
    group by 1
    order by shown desc
  `;

  return rows.map((row) => ({
    variant: row.variant,
    shown: parseInt(row.shown, 10),
    converted: parseInt(row.converted, 10),
    declined: parseInt(row.declined, 10),
    completed: parseInt(row.completed, 10),
  }));
}

export async function getFunnelStepStats(
  shop: string,
  testId: string,
): Promise<FunnelStepStats[]> {
  const db = getSql();
  const rows = await db<{ step: string; count: string }[]>`
    select
      coalesce(event_data->>'step', 'unknown') as step,
      count(distinct reference_id)::text as count
    from analytics_events
    where shop = ${shop}
      and test_id = ${testId}
      and event_type = 'step_viewed'
      and length(coalesce(reference_id, '')) >= 12
      and coalesce(reference_id, '') !~ '^test'
    group by 1
    order by count(distinct reference_id) desc
    limit 12
  `;

  return rows.map((row) => ({
    step: row.step,
    count: parseInt(row.count, 10),
  }));
}

export async function getFunnelTypeBreakdown(
  shop: string,
  testId?: string,
): Promise<FunnelTypeStats[]> {
  const db = getSql();

  if (testId) {
    const rows = await db<
      {
        funnel_type: string;
        shown: string;
        converted: string;
        declined: string;
        qualified: string;
        rejected: string;
      }[]
    >`
      select
        coalesce(event_data->>'testType', event_data->>'comboVariant', 'unknown') as funnel_type,
        count(distinct reference_id) filter (
          where event_type = 'test_shown'
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        )::text as shown,
        count(distinct reference_id) filter (
          where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        )::text as converted,
        count(distinct reference_id) filter (
          where event_type = 'offer_declined'
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        )::text as declined,
        count(distinct reference_id) filter (
          where event_type = 'qualified'
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        )::text as qualified,
        count(distinct reference_id) filter (
          where event_type = 'rejected'
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        )::text as rejected
      from analytics_events
      where shop = ${shop} and test_id = ${testId}
      group by 1
      order by shown desc
    `;
    return rows.map((row) => ({
      funnelType: row.funnel_type,
      shown: parseInt(row.shown, 10),
      converted: parseInt(row.converted, 10),
      declined: parseInt(row.declined, 10),
      qualified: parseInt(row.qualified, 10),
      rejected: parseInt(row.rejected, 10),
    }));
  }

  const rows = await db<
    {
      funnel_type: string;
      shown: string;
      converted: string;
      declined: string;
      qualified: string;
      rejected: string;
    }[]
  >`
    select
      coalesce(event_data->>'testType', event_data->>'comboVariant', 'unknown') as funnel_type,
      count(distinct reference_id) filter (
        where event_type = 'test_shown'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as shown,
      count(distinct reference_id) filter (
        where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as converted,
      count(distinct reference_id) filter (
        where event_type = 'offer_declined'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as declined,
      count(distinct reference_id) filter (
        where event_type = 'qualified'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as qualified,
      count(distinct reference_id) filter (
        where event_type = 'rejected'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as rejected
    from analytics_events
    where shop = ${shop}
    group by 1
    order by shown desc
  `;

  return rows.map((row) => ({
    funnelType: row.funnel_type,
    shown: parseInt(row.shown, 10),
    converted: parseInt(row.converted, 10),
    declined: parseInt(row.declined, 10),
    qualified: parseInt(row.qualified, 10),
    rejected: parseInt(row.rejected, 10),
  }));
}

export async function getTestAnalyticsSummaries(
  shop: string,
): Promise<TestAnalyticsSummary[]> {
  const db = getSql();
  const [conversionRows, funnelRows, fx] = await Promise.all([
    fetchConversionOrderRows(shop),
    db<
      {
        test_id: string;
        shown: string;
        converted: string;
      }[]
    >`
      select
        test_id,
        count(distinct reference_id) filter (
          where event_type = 'test_shown'
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        )::text as shown,
        count(distinct reference_id) filter (
          where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        )::text as converted
      from analytics_events
      where shop = ${shop} and test_id is not null
      group by test_id
    `,
    getUsdFxRates(),
  ]);

  const revenueByTest = summarizeRevenueByTest(
    mapConversionOrderRows(conversionRows),
    fx,
  );

  return funnelRows.map((row) => {
    const shown = parseInt(row.shown, 10);
    const converted = parseInt(row.converted, 10);
    const revenue = revenueByTest.get(row.test_id);
    const totalRevenue = revenue?.totalRevenue ?? 0;
    const ordersWithRevenue = revenue?.ordersWithRevenue ?? 0;

    return {
      testId: row.test_id,
      shown,
      converted,
      conversionRate:
        shown > 0 ? Math.min(100, Math.round((converted / shown) * 100)) : 0,
      totalRevenue,
      revenuePerVisitor: computeRevenuePerVisitor(totalRevenue, shown),
      averageOrderValue: computeAverageOrderValue(
        totalRevenue,
        ordersWithRevenue,
      ),
      currency: REPORTING_CURRENCY,
    };
  });
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
  const db = getSql();

  const [base, revenue, comboRows, funnelSteps, funnelTypeBreakdown] =
    await Promise.all([
      getDashboardStats(shop),
      getRevenueStats(shop),
      db<
      {
        variant: string;
        shown: string;
        converted: string;
        declined: string;
        completed: string;
      }[]
    >`
      select
        coalesce(event_data->>'comboVariant', 'unknown') as variant,
        count(distinct reference_id) filter (
          where event_type = 'test_shown'
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        )::text as shown,
        count(distinct reference_id) filter (
          where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        )::text as converted,
        count(distinct reference_id) filter (
          where event_type = 'offer_declined'
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        )::text as declined,
        count(distinct reference_id) filter (
          where event_type = 'test_completed'
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        )::text as completed
      from analytics_events
      where shop = ${shop}
        and event_data->>'comboVariant' is not null
      group by 1
      order by shown desc
    `,
    db<{ step: string; count: string }[]>`
      select
        coalesce(event_data->>'step', 'unknown') as step,
        count(distinct reference_id)::text as count
      from analytics_events
      where shop = ${shop}
        and event_type = 'step_viewed'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      group by 1
      order by count(distinct reference_id) desc
      limit 8
    `,
    getFunnelTypeBreakdown(shop),
  ]);

  const acceptedTotal = base.totalAccepted;
  const conversionRate =
    base.totalShown > 0
      ? Math.min(100, Math.round((acceptedTotal / base.totalShown) * 100))
      : 0;

  return {
    ...attachRevenueMetrics(base, revenue),
    conversionRate,
    comboSplit: comboRows.map((row) => ({
      variant: row.variant,
      shown: parseInt(row.shown, 10),
      converted: parseInt(row.converted, 10),
      declined: parseInt(row.declined, 10),
      completed: parseInt(row.completed, 10),
    })),
    funnelSteps: funnelSteps.map((row) => ({
      step: row.step,
      count: parseInt(row.count, 10),
    })),
    funnelTypeBreakdown,
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

async function fetchScopedConversionOrderRows(
  shop: string,
  scope: AnalyticsScope,
  testId?: string,
) {
  if (!scopeHasData(scope)) return [];

  const db = getSql();
  const scopedTestIds =
    testId != null
      ? scope.testIds === null || scope.testIds.includes(testId)
        ? [testId]
        : []
      : scope.testIds;

  if (scopedTestIds !== null && scopedTestIds.length === 0) return [];

  const rows = testId
    ? await db<
        {
          reference_id: string;
          test_id: string | null;
          event_type: string;
          event_data: unknown;
        }[]
      >`
        select distinct on (reference_id)
          reference_id,
          test_id,
          event_type,
          event_data
        from analytics_events
        where shop = ${shop}
          and test_id = ${testId}
          and event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
          ${scope.since ? db`and created_at >= ${scope.since.toISOString()}` : db``}
        order by reference_id, created_at desc
      `
    : await db<
        {
          reference_id: string;
          test_id: string | null;
          event_type: string;
          event_data: unknown;
        }[]
      >`
        select distinct on (reference_id)
          reference_id,
          test_id,
          event_type,
          event_data
        from analytics_events
        where shop = ${shop}
          and event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
          ${scope.since ? db`and created_at >= ${scope.since.toISOString()}` : db``}
          ${
            scopedTestIds
              ? db`and test_id in ${db(scopedTestIds)}`
              : db``
          }
        order by reference_id, created_at desc
      `;

  try {
    return await Promise.all(
      rows.map((row) => resolveConversionOrderRow(shop, row)),
    );
  } catch (error) {
    console.error("fetchScopedConversionOrderRows failed:", error);
    return [];
  }
}

async function getScopedDashboardStats(
  shop: string,
  scope: AnalyticsScope,
): Promise<DashboardStats> {
  if (!scopeHasData(scope)) return emptyDashboardStats();

  const db = getSql();
  const rows = await db<StatsRow[]>`
    select
      count(distinct reference_id) filter (
        where event_type = 'test_shown'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_shown,
      count(distinct reference_id) filter (
        where event_type = 'qualified'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_qualified,
      count(distinct reference_id) filter (
        where event_type = 'rejected'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_rejected,
      count(distinct reference_id) filter (
        where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_accepted,
      count(distinct reference_id) filter (
        where event_type = 'offer_declined'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_declined,
      count(distinct reference_id) filter (
        where event_type = 'product_auto_added'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_auto_added,
      count(distinct reference_id) filter (
        where event_type = 'test_completed'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_completed,
      count(distinct reference_id) filter (
        where event_type = 'offer_config_loaded'
        and length(coalesce(reference_id, '')) >= 12
        and coalesce(reference_id, '') !~ '^test'
      )::text as total_api_checks
    from analytics_events
    where shop = ${shop}
      ${scope.since ? db`and created_at >= ${scope.since.toISOString()}` : db``}
      ${
        scope.testIds
          ? db`and test_id in ${db(scope.testIds)}`
          : db``
      }
  `;
  return mapStatsRow(rows[0]);
}

async function getScopedRevenueStats(
  shop: string,
  scope: AnalyticsScope,
  testId?: string,
): Promise<RevenueStats> {
  const rows = mapConversionOrderRows(
    await fetchScopedConversionOrderRows(shop, scope, testId),
  );
  return buildRevenueStats(rows);
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

  const db = getSql();

  const [base, revenue, comboRows, funnelSteps, funnelTypeBreakdown] =
    await Promise.all([
      getScopedDashboardStats(shop, scope),
      getScopedRevenueStats(shop, scope),
      db<
        {
          variant: string;
          shown: string;
          converted: string;
          declined: string;
          completed: string;
        }[]
      >`
        select
          coalesce(event_data->>'comboVariant', 'unknown') as variant,
          count(distinct reference_id) filter (
            where event_type = 'test_shown'
            and length(coalesce(reference_id, '')) >= 12
            and coalesce(reference_id, '') !~ '^test'
          )::text as shown,
          count(distinct reference_id) filter (
            where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
            and length(coalesce(reference_id, '')) >= 12
            and coalesce(reference_id, '') !~ '^test'
          )::text as converted,
          count(distinct reference_id) filter (
            where event_type = 'offer_declined'
            and length(coalesce(reference_id, '')) >= 12
            and coalesce(reference_id, '') !~ '^test'
          )::text as declined,
          count(distinct reference_id) filter (
            where event_type = 'test_completed'
            and length(coalesce(reference_id, '')) >= 12
            and coalesce(reference_id, '') !~ '^test'
          )::text as completed
        from analytics_events
        where shop = ${shop}
          and event_data->>'comboVariant' is not null
          ${scope.since ? db`and created_at >= ${scope.since.toISOString()}` : db``}
          ${
            scope.testIds
              ? db`and test_id in ${db(scope.testIds)}`
              : db``
          }
        group by 1
        order by shown desc
      `,
      db<{ step: string; count: string }[]>`
        select
          coalesce(event_data->>'step', 'unknown') as step,
          count(distinct reference_id)::text as count
        from analytics_events
        where shop = ${shop}
          and event_type = 'step_viewed'
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
          ${scope.since ? db`and created_at >= ${scope.since.toISOString()}` : db``}
          ${
            scope.testIds
              ? db`and test_id in ${db(scope.testIds)}`
              : db``
          }
        group by 1
        order by count(distinct reference_id) desc
        limit 8
      `,
      getFunnelTypeBreakdown(shop),
    ]);

  const acceptedTotal = base.totalAccepted;
  const conversionRate =
    base.totalShown > 0
      ? Math.min(100, Math.round((acceptedTotal / base.totalShown) * 100))
      : 0;

  return {
    ...attachRevenueMetrics(base, revenue),
    conversionRate,
    comboSplit: comboRows.map((row) => ({
      variant: row.variant,
      shown: parseInt(row.shown, 10),
      converted: parseInt(row.converted, 10),
      declined: parseInt(row.declined, 10),
      completed: parseInt(row.completed, 10),
    })),
    funnelSteps: funnelSteps.map((row) => ({
      step: row.step,
      count: parseInt(row.count, 10),
    })),
    funnelTypeBreakdown,
  };
}

export async function getScopedTestAnalyticsSummaries(
  shop: string,
  scope: AnalyticsScope,
): Promise<TestAnalyticsSummary[]> {
  if (!scopeHasData(scope)) return [];

  const db = getSql();
  const [conversionRows, funnelRows, fx] = await Promise.all([
    fetchScopedConversionOrderRows(shop, scope),
    db<
      {
        test_id: string;
        shown: string;
        converted: string;
      }[]
    >`
      select
        test_id,
        count(distinct reference_id) filter (
          where event_type = 'test_shown'
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        )::text as shown,
        count(distinct reference_id) filter (
          where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
        )::text as converted
      from analytics_events
      where shop = ${shop}
        and test_id is not null
        ${scope.since ? db`and created_at >= ${scope.since.toISOString()}` : db``}
        ${
          scope.testIds
            ? db`and test_id in ${db(scope.testIds)}`
            : db``
        }
      group by test_id
    `,
    getUsdFxRates(),
  ]);

  const revenueByTest = summarizeRevenueByTest(
    mapConversionOrderRows(conversionRows),
    fx,
  );

  return funnelRows.map((row) => {
    const shown = parseInt(row.shown, 10);
    const converted = parseInt(row.converted, 10);
    const revenue = revenueByTest.get(row.test_id);
    const totalRevenue = revenue?.totalRevenue ?? 0;
    const ordersWithRevenue = revenue?.ordersWithRevenue ?? 0;

    return {
      testId: row.test_id,
      shown,
      converted,
      conversionRate:
        shown > 0 ? Math.min(100, Math.round((converted / shown) * 100)) : 0,
      totalRevenue,
      revenuePerVisitor: computeRevenuePerVisitor(totalRevenue, shown),
      averageOrderValue: computeAverageOrderValue(
        totalRevenue,
        ordersWithRevenue,
      ),
      currency: REPORTING_CURRENCY,
    };
  });
}
