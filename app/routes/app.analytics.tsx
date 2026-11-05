import { useCallback } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { isSupabaseConfigured } from "../lib/supabase.server";
import { listTests } from "../lib/tests.server";
import {
  getFilteredDashboardAnalyticsDetail,
  getScopedTestAnalyticsSummaries,
  getUsdFxRates,
  type TestAnalyticsDetail,
  type TestAnalyticsSummary,
} from "../lib/analytics.server";
import {
  analyticsAccessError,
  hasAnalyticsAccess,
  resolvePlanTier,
} from "../lib/billing.plans";
import { getShopBillingRecord } from "../lib/billing-records.server";
import {
  analyticsFilterSummary,
  filtersToSearchParams,
  parseAnalyticsFilters,
  periodSince,
  resolveFilteredTestIds,
  type AnalyticsFilterState,
} from "../lib/analytics.filters";
import { TEST_TYPE_LABELS } from "../lib/tests.types";
import { formatMoney, convertFromUsd } from "../lib/analytics.format";
import {
  RevenueCurrencySelector,
  useDisplayCurrency,
} from "../components/RevenueCurrencySelector";
import {
  ComboSplitChart,
  ConversionFunnelChart,
  FunnelStepsChart,
  FunnelTypeBreakdownChart,
  GaugeChart,
  RevenueAnalyticsVisuals,
  RevenueMetricsPanel,
} from "../components/AnalyticsCharts";
import { AnalyticsFiltersBar } from "../components/AnalyticsFiltersBar";
import { DatabaseSetupBanner } from "../components/DatabaseSetupBanner";
import { useAppNavigate } from "../hooks/useAppNavigate";

/** Queries can outlast React's streaming abort on Vercel. Wait for them in the loader. */
export const maxDuration = 60;

type AnalyticsPayload = {
  detail: TestAnalyticsDetail;
  summaries: TestAnalyticsSummary[];
  funnelTypeBreakdown: Array<{
    funnelType: string;
    shown: number;
    converted: number;
  }>;
  fx: { rates: Record<string, number>; asOf: string };
};

async function loadAnalyticsPayload(
  shop: string,
  scope: { testIds: string[] | null; since: Date | null },
): Promise<AnalyticsPayload | null> {
  try {
    const [detail, summaries, fx] = await Promise.all([
      getFilteredDashboardAnalyticsDetail(shop, scope).catch(() => null),
      getScopedTestAnalyticsSummaries(shop, scope).catch(() => []),
      getUsdFxRates().catch(() => null),
    ]);
    if (!detail || !fx) return null;
    return {
      detail,
      summaries,
      funnelTypeBreakdown: detail.funnelTypeBreakdown ?? [],
      fx,
    };
  } catch (error) {
    console.error("Analytics payload failed:", error);
    return null;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const billingRecord = await getShopBillingRecord(session.shop);
  const tier = billingRecord?.hasActivePayment
    ? resolvePlanTier(billingRecord.subscriptionName)
    : null;
  const dbReady = isSupabaseConfigured();
  const filters = parseAnalyticsFilters(new URL(request.url).searchParams);

  if (!hasAnalyticsAccess(tier)) {
    return {
      accessDenied: true as const,
      tier,
      dbReady,
      filters,
      analytics: null as AnalyticsPayload | null,
      tests: [] as Awaited<ReturnType<typeof listTests>>,
    };
  }

  const tests = dbReady
    ? await listTests(session.shop).catch(() => [])
    : [];

  const testIds = resolveFilteredTestIds(tests, filters);
  const scope = {
    testIds,
    since: periodSince(filters.period),
  };

  const analytics = dbReady
    ? await loadAnalyticsPayload(session.shop, scope)
    : null;

  return {
    accessDenied: false as const,
    tier,
    dbReady,
    filters,
    tests,
    analytics,
  };
};

export default function AnalyticsPage() {
  const { accessDenied, tier, dbReady, filters, tests, analytics } =
    useLoaderData<typeof loader>();
  const appNavigate = useAppNavigate();
  const [, setSearchParams] = useSearchParams();
  const [displayCurrency, setDisplayCurrency] = useDisplayCurrency();

  const funnelOptions = (tests ?? []).map((test) => ({
    id: test.id,
    name: test.name,
    type: test.type,
    status: test.status,
  }));

  const applyFilters = useCallback(
    (next: AnalyticsFilterState) => {
      setSearchParams(filtersToSearchParams(next), { replace: true });
    },
    [setSearchParams],
  );

  if (accessDenied) {
    return (
      <s-page heading="Analytics">
        <s-banner tone="warning" heading="Upgrade to unlock analytics">
          <s-stack direction="block" gap="base">
            <s-paragraph>{analyticsAccessError(tier)}</s-paragraph>
            <s-button onClick={() => appNavigate("/app/billing")}>
              View plans
            </s-button>
          </s-stack>
        </s-banner>
        <s-section heading="Available on Growth & Scale">
          <s-box padding="base" border="base" borderRadius="base" background="subdued">
            <s-unordered-list>
              <s-list-item>Full revenue analytics with visual charts</s-list-item>
              <s-list-item>Conversion funnel breakdowns</s-list-item>
              <s-list-item>Per-funnel performance table</s-list-item>
              <s-list-item>Funnel type and step analytics</s-list-item>
            </s-unordered-list>
          </s-box>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Analytics">
      <s-button
        slot="primary-action"
        variant="secondary"
        onClick={() => appNavigate("/app")}
      >
        Back to dashboard
      </s-button>

      <DatabaseSetupBanner dbReady={dbReady} />

      <AnalyticsFiltersBar
        filters={filters}
        tests={funnelOptions}
        onChange={applyFilters}
      />

      <s-box padding="small" border="base" borderRadius="base" background="subdued">
        <s-text tone="neutral" color="subdued">
          Showing: {analyticsFilterSummary(filters, funnelOptions)}
        </s-text>
      </s-box>

      {analytics ? (
        <FullAnalyticsView
          stats={analytics.detail}
          summaries={analytics.summaries}
          funnelTypeBreakdown={analytics.funnelTypeBreakdown}
          tests={tests}
          fx={analytics.fx}
          displayCurrency={displayCurrency}
          onDisplayCurrencyChange={setDisplayCurrency}
        />
      ) : (
        <s-banner tone="info">
          Analytics could not be loaded. Check your database connection and try
          again.
        </s-banner>
      )}
    </s-page>
  );
}

function FullAnalyticsView({
  stats,
  summaries,
  funnelTypeBreakdown,
  tests,
  fx,
  displayCurrency,
  onDisplayCurrencyChange,
}: {
  stats: TestAnalyticsDetail;
  summaries: TestAnalyticsSummary[];
  funnelTypeBreakdown: Array<{
    funnelType: string;
    shown: number;
    converted: number;
  }>;
  tests: Awaited<ReturnType<typeof listTests>>;
  fx: { rates: Record<string, number>; asOf: string };
  displayCurrency: string;
  onDisplayCurrencyChange: (currency: string) => void;
}) {
  const testNameById = new Map(tests.map((test) => [test.id, test.name]));
  const testTypeById = new Map(tests.map((test) => [test.id, test.type]));

  const funnelRows = summaries.map((row) => ({
    testId: row.testId,
    name: testNameById.get(row.testId) ?? `Funnel ${row.testId.slice(0, 8)}`,
    revenue: row.totalRevenue,
    shown: row.shown,
    converted: row.converted,
  }));

  const formatDisplay = (amountUsd: number) =>
    formatMoney(
      convertFromUsd(amountUsd, displayCurrency, fx.rates),
      displayCurrency,
    );

  return (
    <s-stack direction="block" gap="base">
        <s-section heading="Revenue analytics">
          <s-stack direction="block" gap="base">
            <RevenueMetricsPanel
              totalShown={stats.totalShown}
              totalRevenue={stats.totalRevenue}
              revenuePerVisitor={stats.revenuePerVisitor}
              averageOrderValue={stats.averageOrderValue}
              ordersWithRevenue={stats.ordersWithRevenue}
              currency={stats.currency}
              fxAsOf={fx.asOf}
              displayCurrency={displayCurrency}
              fxRates={fx.rates}
              onDisplayCurrencyChange={onDisplayCurrencyChange}
            />
            <RevenueAnalyticsVisuals
              totalRevenue={stats.totalRevenue}
              revenuePerVisitor={stats.revenuePerVisitor}
              averageOrderValue={stats.averageOrderValue}
              ordersWithRevenue={stats.ordersWithRevenue}
              funnelRows={funnelRows}
              displayCurrency={displayCurrency}
              fxRates={fx.rates}
            />
          </s-stack>
        </s-section>

        <s-section heading="Conversion analytics">
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
              <StatCard label="Shown" value={String(stats.totalShown)} hint="Offer page impressions" />
              <StatCard label="Accepted" value={String(stats.totalAccepted)} hint="Unique conversions" />
              <StatCard label="Declined" value={String(stats.totalDeclined)} hint="Offer declined" />
              <StatCard label="Completed" value={String(stats.totalCompleted)} hint="Finished full funnel" />
            </s-grid>
            <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
              <StatCard label="Qualified" value={String(stats.totalQualified)} hint="Quiz / trial pass" />
              <StatCard label="Rejected" value={String(stats.totalRejected)} hint="Quiz / trial fail" />
              <StatCard
                label="Conversion rate"
                value={`${stats.conversionRate}%`}
                hint="Accepted ÷ shown"
              />
            </s-grid>
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <ConversionFunnelChart
                shown={stats.totalShown}
                accepted={stats.totalAccepted}
                declined={stats.totalDeclined}
                completed={stats.totalCompleted}
              />
              <GaugeChart
                title="Overall conversion rate"
                percent={stats.conversionRate}
                caption={`${stats.totalAccepted} accepted of ${stats.totalShown} shown`}
              />
            </s-grid>
            <FunnelStepsChart
              steps={stats.funnelSteps}
              baseline={stats.totalShown > 0 ? stats.totalShown : undefined}
            />
            {funnelTypeBreakdown.length > 0 ? (
              <FunnelTypeBreakdownChart breakdown={funnelTypeBreakdown} />
            ) : null}
            {stats.comboSplit.length > 0 ? (
              <ComboSplitChart splits={stats.comboSplit} />
            ) : null}
            {stats.totalApiChecks > 0 && stats.totalShown === 0 ? (
              <s-banner tone="info">
                Checkout reached your app {stats.totalApiChecks} time(s) but the
                offer page did not render. Check extension debug logs after your
                next test order.
              </s-banner>
            ) : null}
          </s-stack>
        </s-section>

        <s-section heading="Per-funnel performance">
          <s-box border="base" borderRadius="base" background="base">
            {summaries.length === 0 ? (
              <s-box padding="large-400">
                <s-text tone="neutral" color="subdued">
                  No data matches your filters. Try widening the date range or
                  clearing filters.
                </s-text>
              </s-box>
            ) : (
              <s-table variant="auto">
                <s-table-header-row>
                  <s-table-header listSlot="primary">Funnel</s-table-header>
                  <s-table-header>Type</s-table-header>
                  <s-table-header>Shown</s-table-header>
                  <s-table-header>Converted</s-table-header>
                  <s-table-header>Conv. rate</s-table-header>
                  <s-table-header>Revenue</s-table-header>
                  <s-table-header>RPV</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {summaries.map((row) => {
                    const type = testTypeById.get(row.testId);
                    const name =
                      testNameById.get(row.testId) ??
                      `Funnel ${row.testId.slice(0, 8)}`;
                    return (
                      <s-table-row key={row.testId}>
                        <s-table-cell>
                          <Link
                            to={`/app/funnel/${row.testId}`}
                            style={{
                              color: "var(--p-color-text-link)",
                              textDecoration: "none",
                              fontWeight: 500,
                            }}
                          >
                            {name}
                          </Link>
                        </s-table-cell>
                        <s-table-cell>
                          {type ? TEST_TYPE_LABELS[type] : "—"}
                        </s-table-cell>
                        <s-table-cell>{row.shown}</s-table-cell>
                        <s-table-cell>{row.converted}</s-table-cell>
                        <s-table-cell>{row.conversionRate}%</s-table-cell>
                        <s-table-cell>{formatDisplay(row.totalRevenue)}</s-table-cell>
                        <s-table-cell>
                          {formatDisplay(row.revenuePerVisitor)}
                        </s-table-cell>
                      </s-table-row>
                    );
                  })}
                </s-table-body>
              </s-table>
            )}
          </s-box>
        </s-section>
    </s-stack>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <s-box padding="base" border="base" borderRadius="base" background="base">
      <s-stack direction="block" gap="small">
        <s-text tone="neutral" color="subdued">
          {label}
        </s-text>
        <s-heading>{value}</s-heading>
        <s-text tone="neutral" color="subdued">
          {hint}
        </s-text>
      </s-stack>
    </s-box>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  const headers = boundary.headers(headersArgs);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return headers;
};
