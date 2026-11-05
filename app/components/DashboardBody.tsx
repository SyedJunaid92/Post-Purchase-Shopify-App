import { Suspense } from "react";
import { Link } from "react-router";
import { useAppNavigate } from "../hooks/useAppNavigate";
import { useAppLayoutData } from "../hooks/useAppLayoutData";
import { hasAnalyticsAccess } from "../lib/billing.plans";
import type { DashboardApiResponse } from "../lib/dashboard-data.server";
import { formatTestDate } from "../lib/tests.utils";
import { TEST_TYPE_LABELS } from "../lib/tests.types";
import { TestStatusBadge } from "./TestStatusBadge";
import { PostPurchaseSetupBanner } from "./PostPurchaseSetupBanner";
import { DatabaseSetupBanner } from "./DatabaseSetupBanner";
import { LazyDonutChart, LazyGaugeChart } from "./lazy-funnel-editors";
import { formatMoney, convertFromUsd } from "../lib/analytics.format";
import { useDisplayCurrency } from "./RevenueCurrencySelector";

export default function DashboardBody({
  data,
}: {
  data: DashboardApiResponse | undefined;
}) {
  const layout = useAppLayoutData();
  const appNavigate = useAppNavigate();
  const [displayCurrency] = useDisplayCurrency();

  const billingTest = layout?.billingTest ?? false;
  const showAnalyticsLink = hasAnalyticsAccess(layout?.tier ?? null);
  const dbReady = data?.dbReady ?? layout?.dbReady ?? false;
  const summary = data?.funnelSummary;
  const stats = data?.stats;

  return (
    <>
      {summary ? (
        <DatabaseSetupBanner dbReady={dbReady} dbError={summary.dbError} />
      ) : null}

      {data?.postPurchaseStatus ? (
        <PostPurchaseSetupBanner
          status={data.postPurchaseStatus}
          billingTest={billingTest}
          checkoutSettingsUrl={data.checkoutSettingsUrl}
        />
      ) : null}

      <s-section>
        <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
          <MetricCard
            label="Total tests"
            value={summary ? String(summary.counts.all) : "—"}
            hint="All post-purchase experiments"
          />
          <MetricCard
            label="Active"
            value={summary ? String(summary.counts.active) : "—"}
            hint="Currently running"
          />
          <MetricCard
            label="Revenue"
            value={
              stats
                ? formatMoney(
                    convertFromUsd(
                      stats.detail.totalRevenue,
                      displayCurrency,
                      stats.fx.rates,
                    ),
                    displayCurrency,
                  )
                : "—"
            }
            hint="Post-purchase revenue (USD normalized)"
          />
          <MetricCard
            label="Traffic split"
            value={summary?.avgTraffic ?? "—"}
            hint="Avg. on active tests"
          />
        </s-grid>
      </s-section>

      {summary ? (
        <s-section heading="At a glance">
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <Suspense fallback={<ChartPlaceholder />}>
              <LazyDonutChart
                title="Funnels by status"
                centerValue={String(summary.counts.all)}
                centerLabel="funnels"
                emptyMessage="Create a funnel to see the breakdown"
                segments={[
                  { label: "Active", value: summary.counts.active, color: "#008060" },
                  { label: "Paused", value: summary.counts.paused, color: "#b98900" },
                  { label: "Draft", value: summary.counts.draft, color: "#5c6ac4" },
                  { label: "Closed", value: summary.counts.closed, color: "#8c9196" },
                ]}
              />
            </Suspense>
            <Suspense fallback={<ChartPlaceholder />}>
              {stats ? (
                <LazyGaugeChart
                  title="Conversion rate"
                  percent={stats.detail.conversionRate}
                  caption={`${stats.detail.totalAccepted} accepted of ${stats.detail.totalShown} shown`}
                />
              ) : (
                <LazyGaugeChart
                  title="Conversion rate"
                  percent={0}
                  caption="Complete a test checkout to see conversions"
                />
              )}
            </Suspense>
          </s-grid>
        </s-section>
      ) : (
        <s-section heading="At a glance">
          <s-text tone="neutral" color="subdued">
            Loading charts…
          </s-text>
        </s-section>
      )}

      {showAnalyticsLink ? (
        <s-section>
          <s-box padding="base" border="base" borderRadius="base" background="subdued">
            <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <s-stack direction="block" gap="small">
                <s-text type="strong">Full analytics available</s-text>
                <s-text tone="neutral" color="subdued">
                  View revenue charts, conversion funnels, and per-funnel
                  performance in the analytics dashboard.
                </s-text>
              </s-stack>
              <s-button onClick={() => appNavigate("/app/analytics")}>
                Open analytics
              </s-button>
            </s-stack>
          </s-box>
        </s-section>
      ) : null}

      <s-section heading="Recent funnels">
        <s-box border="base" borderRadius="base" background="base">
          {!summary ? (
            <s-box padding="base">
              <s-text tone="neutral" color="subdued">
                Loading funnels…
              </s-text>
            </s-box>
          ) : summary.recentTests.length === 0 ? (
            <s-box padding="large-400">
              <s-stack direction="block" gap="base" alignItems="center">
                <s-text tone="neutral" color="subdued">
                  No funnels yet. Create your first post-purchase experiment.
                </s-text>
                <s-button onClick={() => appNavigate("/app/funnel/new")}>
                  Create
                </s-button>
              </s-stack>
            </s-box>
          ) : (
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">Name</s-table-header>
                <s-table-header>Status</s-table-header>
                <s-table-header>Type</s-table-header>
                <s-table-header>Updated</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {summary.recentTests.map((test) => (
                  <s-table-row key={test.id}>
                    <s-table-cell>
                      <Link
                        to={`/app/funnel/${test.id}`}
                        style={{
                          color: "var(--p-color-text-link)",
                          textDecoration: "none",
                          fontWeight: 500,
                        }}
                      >
                        {test.name}
                      </Link>
                    </s-table-cell>
                    <s-table-cell>
                      <TestStatusBadge status={test.status} />
                    </s-table-cell>
                    <s-table-cell>{TEST_TYPE_LABELS[test.type]}</s-table-cell>
                    <s-table-cell>{formatTestDate(test.updatedAt)}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-box>
      </s-section>
    </>
  );
}

/** Body text only — s-heading would compete with the page title for LCP. */
function MetricCard({
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
      <s-stack direction="block" gap="base">
        <s-text tone="neutral" color="subdued">
          {label}
        </s-text>
        <s-text type="strong">{value}</s-text>
        <s-text tone="neutral" color="subdued">
          {hint}
        </s-text>
      </s-stack>
    </s-box>
  );
}

function ChartPlaceholder() {
  return (
    <s-box padding="base" border="base" borderRadius="base" background="base">
      <s-text tone="neutral" color="subdued">
        Loading chart…
      </s-text>
    </s-box>
  );
}
