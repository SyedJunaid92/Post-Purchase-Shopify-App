import type { CSSProperties, ReactNode } from "react";
import {
  ANALYTICS_PERIOD_OPTIONS,
  DEFAULT_ANALYTICS_FILTERS,
  filtersToSearchParams,
  hasActiveAnalyticsFilters,
  type AnalyticsFilterState,
  type AnalyticsFunnelOption,
} from "../lib/analytics.filters";
import {
  TEST_STATUS_LABELS,
  TEST_TYPE_LABELS,
  type TestStatus,
  type TestType,
} from "../lib/tests.types";

const selectStyle: CSSProperties = {
  width: "100%",
  minHeight: 36,
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #c9cccf",
  background: "#fff",
  fontSize: 13,
  color: "#202223",
};

type Props = {
  filters: AnalyticsFilterState;
  tests: AnalyticsFunnelOption[];
  onChange: (filters: AnalyticsFilterState) => void;
  loading?: boolean;
};

export function AnalyticsFiltersBar({
  filters,
  tests,
  onChange,
  loading = false,
}: Props) {
  function patch(partial: Partial<AnalyticsFilterState>) {
    onChange({ ...filters, ...partial });
  }

  function resetFilters() {
    onChange(DEFAULT_ANALYTICS_FILTERS);
  }

  return (
    <s-box padding="base" border="base" borderRadius="base" background="base">
      <s-stack direction="block" gap="base">
        <s-stack
          direction="inline"
          gap="base"
          alignItems="center"
          justifyContent="space-between"
        >
          <s-text type="strong">Filters</s-text>
          {hasActiveAnalyticsFilters(filters) ? (
            <s-button variant="tertiary" onClick={resetFilters} disabled={loading}>
              Clear all
            </s-button>
          ) : null}
        </s-stack>

        <s-stack direction="inline" gap="small">
          {ANALYTICS_PERIOD_OPTIONS.map((option) => (
            <s-button
              key={option.id}
              variant={filters.period === option.id ? "primary" : "secondary"}
              onClick={() => patch({ period: option.id })}
              disabled={loading}
            >
              {option.label}
            </s-button>
          ))}
        </s-stack>

        <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
          <FilterField label="Funnel">
            <select
              value={filters.funnelId}
              onChange={(event) => patch({ funnelId: event.target.value })}
              disabled={loading}
              style={selectStyle}
            >
              <option value="all">All funnels</option>
              {tests.map((test) => (
                <option key={test.id} value={test.id}>
                  {test.name}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Funnel type">
            <select
              value={filters.type}
              onChange={(event) =>
                patch({ type: event.target.value as TestType | "all" })
              }
              disabled={loading}
              style={selectStyle}
            >
              <option value="all">All types</option>
              {(Object.keys(TEST_TYPE_LABELS) as TestType[]).map((type) => (
                <option key={type} value={type}>
                  {TEST_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Status">
            <select
              value={filters.status}
              onChange={(event) =>
                patch({ status: event.target.value as TestStatus | "all" })
              }
              disabled={loading}
              style={selectStyle}
            >
              <option value="all">All statuses</option>
              {(Object.keys(TEST_STATUS_LABELS) as TestStatus[]).map(
                (status) => (
                  <option key={status} value={status}>
                    {TEST_STATUS_LABELS[status]}
                  </option>
                ),
              )}
            </select>
          </FilterField>
        </s-grid>
      </s-stack>
    </s-box>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <s-stack direction="block" gap="small">
      <s-text tone="neutral" color="subdued">
        {label}
      </s-text>
      {children}
    </s-stack>
  );
}

export { filtersToSearchParams, hasActiveAnalyticsFilters };
