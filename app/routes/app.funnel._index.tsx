import { Suspense, useMemo, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Await, Link, useLoaderData } from "react-router";
import { useAppNavigate } from "../hooks/useAppNavigate";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { isSupabaseConfigured } from "../lib/supabase.server";
import { listTests, updateTest, type Test } from "../lib/tests.server";
import {
  getFunnelTypeBreakdown,
  getTestAnalyticsSummaries,
  getUsdFxRates,
  type TestAnalyticsSummary,
  type FunnelTypeStats,
} from "../lib/analytics.server";
import { countTestsByStatus, formatTestDate } from "../lib/tests.utils";
import { TEST_TYPE_LABELS, type TestStatus } from "../lib/tests.types";
import { TestStatusBadge } from "../components/TestStatusBadge";
import { TestTypeIcon } from "../components/TestTypeIcon";
import { TestActionsMenu } from "../components/TestActionsMenu";
import { LazyFunnelTypeBreakdownChart } from "../components/lazy-funnel-editors";
import { formatMoney, convertFromUsd } from "../lib/analytics.format";
import {
  RevenueCurrencySelector,
  useDisplayCurrency,
} from "../components/RevenueCurrencySelector";

type StatusFilter = "all" | TestStatus;

type TestsData = {
  tests: Test[];
  counts: ReturnType<typeof countTestsByStatus>;
};

type AnalyticsData = {
  summaries: TestAnalyticsSummary[];
  funnelTypeBreakdown: FunnelTypeStats[];
  fx: { rates: Record<string, number>; asOf: string } | null;
};

type FunnelIndexLoaderData = Awaited<ReturnType<typeof loader>>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const dbReady = isSupabaseConfigured();

  const testsPromise: Promise<TestsData> = dbReady
    ? listTests(session.shop)
        .then((tests) => ({
          tests,
          counts: countTestsByStatus(tests),
        }))
        .catch(() => ({
          tests: [],
          counts: countTestsByStatus([]),
        }))
    : Promise.resolve({
        tests: [],
        counts: countTestsByStatus([]),
      });

  const analyticsPromise: Promise<AnalyticsData> = dbReady
    ? Promise.all([
        getTestAnalyticsSummaries(session.shop).catch(() => []),
        getFunnelTypeBreakdown(session.shop).catch(() => []),
        getUsdFxRates().catch(() => null),
      ]).then(([summaries, funnelTypeBreakdown, fx]) => ({
        summaries,
        funnelTypeBreakdown,
        fx,
      }))
    : Promise.resolve({
        summaries: [],
        funnelTypeBreakdown: [],
        fx: null,
      });

  return { dbReady, testsPromise, analyticsPromise };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const testId = String(form.get("testId") ?? "");

  if (!isSupabaseConfigured() || !testId) {
    return { error: "Invalid request" };
  }

  const statusByIntent: Record<string, TestStatus> = {
    pause: "paused",
    resume: "active",
    end: "closed",
  };

  const status = statusByIntent[intent];
  if (!status) return { error: "Unknown action" };

  await updateTest(session.shop, testId, { status });
  return { success: true };
};

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Draft" },
  { id: "paused", label: "Paused" },
  { id: "closed", label: "Closed" },
];

export default function FunnelIndex() {
  const { dbReady, testsPromise, analyticsPromise } =
    useLoaderData<FunnelIndexLoaderData>();
  const appNavigate = useAppNavigate();
  const [displayCurrency, setDisplayCurrency] = useDisplayCurrency();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  return (
    <s-page heading="Post-Purchase Funnels">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => appNavigate("/app/funnel/new")}
      >
        Create
      </s-button>

      {!dbReady && (
        <s-banner tone="warning">
          Database is not configured. Funnels cannot be saved until DATABASE_URL
          is set.
        </s-banner>
      )}

      <Suspense fallback={<TableLoadingFallback />}>
        <Await resolve={testsPromise}>
          {(testsData) => (
            <FunnelListWithAnalytics
              testsData={testsData}
              analyticsPromise={analyticsPromise}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              search={search}
              setSearch={setSearch}
              selected={selected}
              setSelected={setSelected}
              appNavigate={appNavigate}
              displayCurrency={displayCurrency}
              onDisplayCurrencyChange={setDisplayCurrency}
            />
          )}
        </Await>
      </Suspense>
    </s-page>
  );
}

function TableLoadingFallback() {
  return (
    <s-section>
      <s-box padding="base" border="base" borderRadius="base" background="base">
        <s-text tone="neutral" color="subdued">
          Loading funnels…
        </s-text>
      </s-box>
    </s-section>
  );
}

function FunnelListWithAnalytics({
  testsData,
  analyticsPromise,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  selected,
  setSelected,
  appNavigate,
  displayCurrency,
  onDisplayCurrencyChange,
}: {
  testsData: TestsData;
  analyticsPromise: FunnelIndexLoaderData["analyticsPromise"];
  statusFilter: StatusFilter;
  setStatusFilter: (value: StatusFilter) => void;
  search: string;
  setSearch: (value: string) => void;
  selected: Set<string>;
  setSelected: (value: Set<string>) => void;
  appNavigate: (to: string) => void;
  displayCurrency: string;
  onDisplayCurrencyChange: (currency: string) => void;
}) {
  const filteredTests = useMemo(() => {
    return testsData.tests.filter((test) => {
      const matchesStatus =
        statusFilter === "all" || test.status === statusFilter;
      const matchesSearch =
        !search.trim() ||
        test.name.toLowerCase().includes(search.trim().toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [testsData.tests, statusFilter, search]);

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(filteredTests.map((t) => t.id)));
    } else {
      setSelected(new Set());
    }
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  const countForTab = (id: StatusFilter) => {
    if (id === "all") return testsData.counts.all;
    return testsData.counts[id];
  };

  const tableUi = {
    filteredTests,
    tests: testsData.tests,
    counts: testsData.counts,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    selected,
    toggleAll,
    toggleOne,
    countForTab,
    appNavigate,
    displayCurrency,
    onDisplayCurrencyChange,
  };

  return (
    <>
      <Suspense
        fallback={
          <FunnelTestsSection
            {...tableUi}
            summaryByTestId={{}}
            analyticsLoading
          />
        }
      >
        <Await resolve={analyticsPromise}>
          {(analytics) => (
            <>
              <FunnelTestsSection
                {...tableUi}
                summaryByTestId={Object.fromEntries(
                  analytics.summaries.map((row) => [row.testId, row]),
                )}
                fx={analytics.fx}
              />
              {analytics.funnelTypeBreakdown.length > 0 ? (
                <s-section heading="Analytics by funnel type">
                  <LazyFunnelTypeBreakdownChart
                    breakdown={analytics.funnelTypeBreakdown}
                  />
                </s-section>
              ) : null}
            </>
          )}
        </Await>
      </Suspense>
    </>
  );
}

function FunnelTestsSection({
  filteredTests,
  tests,
  counts,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  selected,
  toggleAll,
  toggleOne,
  countForTab,
  appNavigate,
  summaryByTestId,
  analyticsLoading = false,
  fx,
  displayCurrency,
  onDisplayCurrencyChange,
}: {
  filteredTests: Test[];
  tests: Test[];
  counts: ReturnType<typeof countTestsByStatus>;
  statusFilter: StatusFilter;
  setStatusFilter: (value: StatusFilter) => void;
  search: string;
  setSearch: (value: string) => void;
  selected: Set<string>;
  toggleAll: (checked: boolean) => void;
  toggleOne: (id: string, checked: boolean) => void;
  countForTab: (id: StatusFilter) => number;
  appNavigate: (to: string) => void;
  summaryByTestId: Record<string, TestAnalyticsSummary>;
  analyticsLoading?: boolean;
  fx?: { rates: Record<string, number>; asOf: string } | null;
  displayCurrency?: string;
  onDisplayCurrencyChange?: (currency: string) => void;
}) {
  const rates = fx?.rates ?? { USD: 1 };
  const currency = displayCurrency ?? "USD";

  const formatRevenue = (amountUsd: number) =>
    formatMoney(convertFromUsd(amountUsd, currency, rates), currency);

  return (
    <s-section>
      <s-box padding="base" border="base" borderRadius="base" background="base">
        <s-stack direction="block" gap="base">
          <s-stack
            direction="inline"
            gap="base"
            alignItems="center"
            justifyContent="space-between"
          >
            <s-stack direction="inline" gap="base" alignItems="center">
              {STATUS_TABS.map((tab) => (
                <s-button
                  key={tab.id}
                  variant={statusFilter === tab.id ? "secondary" : "tertiary"}
                  onClick={() => setStatusFilter(tab.id)}
                >
                  {tab.label} ({countForTab(tab.id)})
                </s-button>
              ))}
            </s-stack>

            <s-search-field
              label="Search tests"
              labelAccessibilityVisibility="exclusive"
              placeholder="Search funnels"
              value={search}
              onChange={(e: Event) => {
                const target = e.currentTarget as HTMLInputElement;
                setSearch(target.value);
              }}
            />
            {onDisplayCurrencyChange ? (
              <RevenueCurrencySelector
                value={currency}
                onChange={onDisplayCurrencyChange}
                fxAsOf={fx?.asOf}
              />
            ) : null}
          </s-stack>

          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="labeled">
                <s-checkbox
                  accessibilityLabel="Select all"
                  checked={
                    filteredTests.length > 0 &&
                    selected.size === filteredTests.length
                  }
                  onChange={(e: Event) => {
                    const target = e.currentTarget as HTMLInputElement;
                    toggleAll(target.checked);
                  }}
                />
              </s-table-header>
              <s-table-header listSlot="primary">Name</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Type</s-table-header>
              <s-table-header>Conversion</s-table-header>
              <s-table-header>Revenue</s-table-header>
              <s-table-header>RPV</s-table-header>
              <s-table-header>Creation Date</s-table-header>
              <s-table-header listSlot="labeled" />
            </s-table-header-row>
            <s-table-body>
              {filteredTests.length === 0 ? (
                <s-table-row>
                  <s-table-cell>
                    <s-box padding="large-400">
                      <s-stack direction="block" gap="base" alignItems="center">
                        <s-text tone="neutral" color="subdued">
                          No funnels match your filters.
                        </s-text>
                        <s-button
                          onClick={() => appNavigate("/app/funnel/new")}
                        >
                          Create
                        </s-button>
                      </s-stack>
                    </s-box>
                  </s-table-cell>
                </s-table-row>
              ) : (
                filteredTests.map((test) => (
                  <s-table-row key={test.id}>
                    <s-table-cell>
                      <s-checkbox
                        accessibilityLabel={`Select ${test.name}`}
                        checked={selected.has(test.id)}
                        onChange={(e: Event) => {
                          const target = e.currentTarget as HTMLInputElement;
                          toggleOne(test.id, target.checked);
                        }}
                      />
                    </s-table-cell>
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
                    <s-table-cell>
                      <s-stack
                        direction="inline"
                        gap="base"
                        alignItems="center"
                      >
                        <TestTypeIcon type={test.type} />
                        <s-text tone="neutral" color="subdued">
                          {TEST_TYPE_LABELS[test.type]}
                        </s-text>
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>
                      {analyticsLoading ? (
                        <s-text tone="neutral" color="subdued">
                          …
                        </s-text>
                      ) : summaryByTestId[test.id]?.shown ? (
                        <s-text>
                          {summaryByTestId[test.id].conversionRate}% (
                          {summaryByTestId[test.id].converted}/
                          {summaryByTestId[test.id].shown})
                        </s-text>
                      ) : (
                        <s-text tone="neutral" color="subdued">
                          —
                        </s-text>
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      {analyticsLoading ? (
                        <s-text tone="neutral" color="subdued">
                          …
                        </s-text>
                      ) : summaryByTestId[test.id]?.totalRevenue ? (
                        <s-text>
                          {formatRevenue(summaryByTestId[test.id].totalRevenue)}
                        </s-text>
                      ) : (
                        <s-text tone="neutral" color="subdued">
                          —
                        </s-text>
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      {analyticsLoading ? (
                        <s-text tone="neutral" color="subdued">
                          …
                        </s-text>
                      ) : summaryByTestId[test.id]?.shown ? (
                        <s-text>
                          {formatRevenue(
                            summaryByTestId[test.id].revenuePerVisitor,
                          )}
                        </s-text>
                      ) : (
                        <s-text tone="neutral" color="subdued">
                          —
                        </s-text>
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      {formatTestDate(test.createdAt)}
                    </s-table-cell>
                    <s-table-cell>
                      <TestActionsMenu test={test} />
                    </s-table-cell>
                  </s-table-row>
                ))
              )}
            </s-table-body>
          </s-table>

          <s-text tone="neutral" color="subdued">
            Showing {filteredTests.length} of {tests.length}{" "}
            {tests.length === 1 ? "experiment" : "experiments"}
          </s-text>
        </s-stack>
      </s-box>
    </s-section>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
