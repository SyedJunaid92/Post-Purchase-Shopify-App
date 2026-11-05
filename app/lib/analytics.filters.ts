import type { TestStatus, TestType } from "./tests.types";

export type AnalyticsFunnelOption = {
  id: string;
  name: string;
  type: TestType;
  status: TestStatus;
};

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

export type AnalyticsFilterState = {
  period: AnalyticsPeriod;
  funnelId: string;
  type: TestType | "all";
  status: TestStatus | "all";
};

export const ANALYTICS_PERIOD_OPTIONS: Array<{
  id: AnalyticsPeriod;
  label: string;
}> = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "all", label: "All time" },
];

export const DEFAULT_ANALYTICS_FILTERS: AnalyticsFilterState = {
  period: "30d",
  funnelId: "all",
  type: "all",
  status: "all",
};

const VALID_TYPES = new Set<TestType>([
  "product_offer",
  "trial_unlock",
  "quiz",
  "survey",
  "combo",
]);

const VALID_STATUSES = new Set<TestStatus>([
  "active",
  "draft",
  "paused",
  "closed",
]);

export function parseAnalyticsPeriod(value: string | null): AnalyticsPeriod {
  if (value === "7d" || value === "30d" || value === "90d" || value === "all") {
    return value;
  }
  return DEFAULT_ANALYTICS_FILTERS.period;
}

export function parseAnalyticsFilters(
  searchParams: URLSearchParams,
): AnalyticsFilterState {
  const typeParam = searchParams.get("type");
  const statusParam = searchParams.get("status");

  return {
    period: parseAnalyticsPeriod(searchParams.get("period")),
    funnelId: searchParams.get("funnel")?.trim() || "all",
    type:
      typeParam && VALID_TYPES.has(typeParam as TestType)
        ? (typeParam as TestType)
        : "all",
    status:
      statusParam && VALID_STATUSES.has(statusParam as TestStatus)
        ? (statusParam as TestStatus)
        : "all",
  };
}

export function periodSince(period: AnalyticsPeriod): Date | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - days);
  return since;
}

/** Resolve which test IDs match metadata filters. `null` = no test-id restriction. */
export function resolveFilteredTestIds(
  tests: AnalyticsFunnelOption[],
  filters: AnalyticsFilterState,
): string[] | null {
  const filtered = tests.filter((test) => {
    if (filters.funnelId !== "all" && test.id !== filters.funnelId) {
      return false;
    }
    if (filters.type !== "all" && test.type !== filters.type) {
      return false;
    }
    if (filters.status !== "all" && test.status !== filters.status) {
      return false;
    }
    return true;
  });

  const hasMetaFilter =
    filters.funnelId !== "all" ||
    filters.type !== "all" ||
    filters.status !== "all";

  if (!hasMetaFilter) return null;
  return filtered.map((test) => test.id);
}

export function filtersToSearchParams(
  filters: AnalyticsFilterState,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.period !== DEFAULT_ANALYTICS_FILTERS.period) {
    params.set("period", filters.period);
  }
  if (filters.funnelId !== "all") params.set("funnel", filters.funnelId);
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.status !== "all") params.set("status", filters.status);
  return params;
}

export function hasActiveAnalyticsFilters(
  filters: AnalyticsFilterState,
): boolean {
  return (
    filters.period !== DEFAULT_ANALYTICS_FILTERS.period ||
    filters.funnelId !== "all" ||
    filters.type !== "all" ||
    filters.status !== "all"
  );
}

export function analyticsFilterSummary(
  filters: AnalyticsFilterState,
  tests: AnalyticsFunnelOption[],
): string {
  const parts: string[] = [];
  const periodLabel = ANALYTICS_PERIOD_OPTIONS.find(
    (option) => option.id === filters.period,
  )?.label;
  if (periodLabel) parts.push(periodLabel.toLowerCase());

  if (filters.funnelId !== "all") {
    const funnel = tests.find((test) => test.id === filters.funnelId);
    parts.push(funnel?.name ?? "Selected funnel");
  }
  if (filters.type !== "all") parts.push(filters.type.replace(/_/g, " "));
  if (filters.status !== "all") parts.push(filters.status);

  return parts.length ? parts.join(" · ") : "All data";
}
