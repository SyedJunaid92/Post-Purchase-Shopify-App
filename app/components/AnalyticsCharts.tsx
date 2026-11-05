import { formatMoney, convertFromUsd } from "../lib/analytics.format";
import { RevenueCurrencySelector } from "./RevenueCurrencySelector";

type BarItem = {
  label: string;
  value: number;
  tone?: "brand" | "success" | "warning" | "critical" | "neutral";
};

const BAR_COLORS: Record<NonNullable<BarItem["tone"]>, string> = {
  brand: "#2c6ecb",
  success: "#008060",
  warning: "#b98900",
  critical: "#d82c0d",
  neutral: "#8c9196",
};

function formatRawChartValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

/** Shrink the donut headline so it stays inside the ring. */
function fitCenterFontSize(value: string, innerDiameter: number): number {
  const available = Math.max(40, innerDiameter - 12);
  const estimated = available / (Math.max(value.length, 1) * 0.72);
  return Math.round(Math.max(12, Math.min(28, estimated)));
}

export function HorizontalBarChart({
  title,
  items,
  emptyMessage = "No data yet",
  baseline,
  formatValue,
}: {
  title: string;
  items: BarItem[];
  emptyMessage?: string;
  /** When set, percentages are shown as % of baseline (e.g. shown orders). */
  baseline?: number;
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const total = items.reduce((sum, i) => sum + i.value, 0);

  if (!items.length || total === 0) {
    return (
      <s-box padding="base" border="base" borderRadius="base" background="subdued">
        <s-stack direction="block" gap="base">
          <s-text type="strong">{title}</s-text>
          <s-text tone="neutral" color="subdued">
            {emptyMessage}
          </s-text>
        </s-stack>
      </s-box>
    );
  }

  return (
    <s-box padding="base" border="base" borderRadius="base" background="base">
      <s-stack direction="block" gap="base">
        <s-text type="strong">{title}</s-text>
        {items.map((item) => {
          const width = Math.max(4, Math.round((item.value / max) * 100));
          const pct =
            baseline && baseline > 0
              ? Math.round((item.value / baseline) * 100)
              : total > 0
                ? Math.round((item.value / total) * 100)
                : 0;
          const color = BAR_COLORS[item.tone ?? "brand"];
          return (
            <s-stack key={item.label} direction="block" gap="small">
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-box inlineSize="140px">
                  <s-text>{item.label}</s-text>
                </s-box>
                <s-text type="strong">
                  {formatValue ? formatValue(item.value) : formatRawChartValue(item.value)}
                </s-text>
                <s-text tone="neutral" color="subdued">
                  ({pct}%)
                </s-text>
              </s-stack>
              <div
                style={{
                  height: 10,
                  borderRadius: 6,
                  background: "var(--p-color-bg-surface-secondary, #f1f1f1)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${width}%`,
                    height: "100%",
                    background: color,
                    borderRadius: 6,
                    transition: "width 0.35s ease",
                  }}
                />
              </div>
            </s-stack>
          );
        })}
      </s-stack>
    </s-box>
  );
}

type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

/** SVG donut chart with a centered headline value. */
export function DonutChart({
  title,
  segments,
  centerValue,
  centerLabel,
  emptyMessage = "No data yet",
  size = 168,
  formatValue,
}: {
  title: string;
  segments: DonutSegment[];
  centerValue: string;
  centerLabel?: string;
  emptyMessage?: string;
  size?: number;
  formatValue?: (value: number) => string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const stroke = Math.round(size * 0.12);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const innerDiameter = size - stroke * 2;
  const centerFontSize = fitCenterFontSize(centerValue, innerDiameter);

  let offset = 0;
  const arcs =
    total > 0
      ? segments
          .filter((s) => s.value > 0)
          .map((s) => {
            const fraction = s.value / total;
            const dash = fraction * circumference;
            const arc = {
              ...s,
              dash,
              gap: circumference - dash,
              offset: offset,
              fraction,
            };
            offset += dash;
            return arc;
          })
      : [];

  return (
    <s-box padding="base" border="base" borderRadius="base" background="base">
      <s-stack direction="block" gap="base">
        <s-text type="strong">{title}</s-text>
        {total === 0 ? (
          <s-text tone="neutral" color="subdued">
            {emptyMessage}
          </s-text>
        ) : (
          <s-stack direction="inline" gap="large" alignItems="center">
            <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
              <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                role="img"
                aria-label={title}
              >
                <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="var(--p-color-bg-surface-secondary, #f1f1f1)"
                    strokeWidth={stroke}
                  />
                  {arcs.map((arc) => (
                    <circle
                      key={arc.label}
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      fill="none"
                      stroke={arc.color}
                      strokeWidth={stroke}
                      strokeDasharray={`${arc.dash} ${arc.gap}`}
                      strokeDashoffset={-arc.offset}
                      strokeLinecap="butt"
                      style={{ transition: "stroke-dasharray 0.5s ease" }}
                    />
                  ))}
                </g>
              </svg>
              <div
                style={{
                  position: "absolute",
                  left: stroke,
                  top: stroke,
                  width: innerDiameter,
                  height: innerDiameter,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  pointerEvents: "none",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    fontSize: centerFontSize,
                    fontWeight: 700,
                    lineHeight: 1.1,
                    color: "#202223",
                    maxWidth: "100%",
                    whiteSpace: "nowrap",
                  }}
                >
                  {centerValue}
                </span>
                {centerLabel ? (
                  <span style={{ fontSize: 12, lineHeight: 1.2, color: "#6d7175" }}>
                    {centerLabel}
                  </span>
                ) : null}
              </div>
            </div>
            <s-stack direction="block" gap="small">
              {segments.map((s) => (
                <s-stack
                  key={s.label}
                  direction="inline"
                  gap="small"
                  alignItems="center"
                >
                  <span
                    aria-hidden
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: s.color,
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <s-text>{s.label}</s-text>
                  <s-text type="strong">
                    {formatValue ? formatValue(s.value) : formatRawChartValue(s.value)}
                  </s-text>
                  <s-text tone="neutral" color="subdued">
                    ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)
                  </s-text>
                </s-stack>
              ))}
            </s-stack>
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}

/** Semicircular gauge for a single 0–100 metric (e.g. conversion rate). */
export function GaugeChart({
  title,
  percent,
  caption,
  color = "#008060",
  size = 180,
}: {
  title: string;
  percent: number;
  caption?: string;
  color?: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const stroke = Math.round(size * 0.12);
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const semi = Math.PI * radius;
  const dash = (clamped / 100) * semi;
  const height = size / 2 + stroke;

  return (
    <s-box padding="base" border="base" borderRadius="base" background="base">
      <s-stack direction="block" gap="base" alignItems="center">
        <s-text type="strong">{title}</s-text>
        <svg
          width={size}
          height={height}
          viewBox={`0 0 ${size} ${height}`}
          role="img"
          aria-label={`${title}: ${clamped}%`}
        >
          <path
            d={`M ${stroke / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${cy}`}
            fill="none"
            stroke="var(--p-color-bg-surface-secondary, #f1f1f1)"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <path
            d={`M ${stroke / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${cy}`}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${semi}`}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
          <text
            x="50%"
            y={cy - size * 0.04}
            textAnchor="middle"
            style={{ fontSize: size * 0.18, fontWeight: 700, fill: "#202223" }}
          >
            {`${clamped}%`}
          </text>
        </svg>
        {caption ? (
          <s-text tone="neutral" color="subdued">
            {caption}
          </s-text>
        ) : null}
      </s-stack>
    </s-box>
  );
}

export function ConversionFunnelChart({
  shown,
  accepted,
  declined,
  completed,
}: {
  shown: number;
  accepted: number;
  declined: number;
  completed: number;
}) {
  const items: BarItem[] = [
    { label: "Shown", value: shown, tone: "brand" },
    {
      label: "Accepted",
      value: accepted,
      tone: "success",
    },
    { label: "Declined", value: declined, tone: "critical" },
    { label: "Completed", value: completed, tone: "neutral" },
  ];

  return (
    <HorizontalBarChart
      title="Conversion funnel"
      items={items}
      emptyMessage="Complete a test checkout to see funnel data"
      baseline={shown > 0 ? shown : undefined}
    />
  );
}

const COMBO_LABELS: Record<string, string> = {
  trial_unlock: "Subscription Product Offer",
  quiz: "Quiz Product Offer",
  survey: "Survey Product Offer",
  unknown: "Unknown",
};

export function ComboSplitChart({
  splits,
}: {
  splits: Array<{
    variant: string;
    shown: number;
    converted: number;
  }>;
}) {
  const items: BarItem[] = splits.map((row, index) => ({
    label: COMBO_LABELS[row.variant] ?? row.variant,
    value: row.shown,
    tone: (["brand", "success", "warning"][index] ?? "neutral") as BarItem["tone"],
  }));

  const conversionItems: BarItem[] = splits.map((row, index) => ({
    label: COMBO_LABELS[row.variant] ?? row.variant,
    value: row.converted,
    tone: (["success", "brand", "warning"][index] ?? "neutral") as BarItem["tone"],
  }));

  return (
    <s-stack direction="block" gap="base">
      <HorizontalBarChart
        title="Combo traffic split (shown)"
        items={items}
        emptyMessage="No combo impressions yet"
      />
      <HorizontalBarChart
        title="Combo conversions by variant"
        items={conversionItems}
        emptyMessage="No conversions recorded per variant yet"
      />
    </s-stack>
  );
}

export function FunnelStepsChart({
  steps,
  title = "Funnel step views",
  baseline,
}: {
  steps: Array<{ step: string; count: number }>;
  title?: string;
  baseline?: number;
}) {
  const items: BarItem[] = steps.map((s) => ({
    label: formatStepLabel(s.step),
    value: s.count,
    tone: "brand",
  }));

  return (
    <HorizontalBarChart
      title={title}
      items={items}
      emptyMessage="No step views recorded yet"
      baseline={baseline}
    />
  );
}

function formatStepLabel(step: string): string {
  return step
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const FUNNEL_TYPE_LABELS: Record<string, string> = {
  product_offer: "Product offer",
  trial_unlock: "Subscription Product Offer",
  quiz: "Quiz Product Offer",
  survey: "Survey Product Offer",
  combo: "Combo",
  unknown: "Unknown",
};

const TRIAL_STEP_ORDER = [
  "loading",
  "celebration",
  "features",
  "social_proof",
  "signup",
  "confirmation",
];

const QUIZ_STEP_ORDER = ["intro", "questions", "analyzing", "pass", "fail"];

const SURVEY_STEP_ORDER = ["intro", "survey_start", "reward"];

function orderSteps(
  steps: Array<{ step: string; count: number }>,
  order: string[],
) {
  const map = new Map(steps.map((s) => [s.step, s.count]));
  const ordered = order
    .filter((step) => map.has(step))
    .map((step) => ({ step, count: map.get(step) ?? 0 }));
  const rest = steps.filter((s) => !order.includes(s.step));
  return [...ordered, ...rest];
}

export function QuizOutcomeChart({
  qualified,
  rejected,
  baseline,
}: {
  qualified: number;
  rejected: number;
  baseline?: number;
}) {
  return (
    <HorizontalBarChart
      title="Quiz outcomes"
      items={[
        { label: "Qualified", value: qualified, tone: "success" },
        { label: "Rejected", value: rejected, tone: "critical" },
      ]}
      emptyMessage="No quiz completions yet"
      baseline={baseline}
    />
  );
}

export function FunnelTypeBreakdownChart({
  breakdown,
  title = "Performance by funnel type",
}: {
  breakdown: Array<{
    funnelType: string;
    shown: number;
    converted: number;
  }>;
  title?: string;
}) {
  const items: BarItem[] = breakdown.map((row, index) => ({
    label: FUNNEL_TYPE_LABELS[row.funnelType] ?? row.funnelType,
    value: row.shown,
    tone: (["brand", "success", "warning", "critical"][index] ??
      "neutral") as BarItem["tone"],
  }));

  const conversionItems: BarItem[] = breakdown.map((row, index) => ({
    label: FUNNEL_TYPE_LABELS[row.funnelType] ?? row.funnelType,
    value: row.converted,
    tone: (["success", "brand", "warning", "critical"][index] ??
      "neutral") as BarItem["tone"],
  }));

  return (
    <s-stack direction="block" gap="base">
      <HorizontalBarChart
        title={`${title} — impressions`}
        items={items}
        emptyMessage="No funnel impressions yet"
      />
      <HorizontalBarChart
        title={`${title} — conversions`}
        items={conversionItems}
        emptyMessage="No conversions by type yet"
      />
    </s-stack>
  );
}

type AnalyticsDetail = {
  totalShown: number;
  totalAccepted: number;
  totalAutoAdded: number;
  totalDeclined: number;
  totalQualified: number;
  totalRejected: number;
  totalCompleted: number;
  conversionRate: number;
  totalRevenue: number;
  revenuePerVisitor: number;
  averageOrderValue: number;
  ordersWithRevenue: number;
  currency: string;
  fxAsOf?: string;
  funnelSteps: Array<{ step: string; count: number }>;
  comboSplit: Array<{ variant: string; shown: number; converted: number }>;
  funnelTypeBreakdown?: Array<{
    funnelType: string;
    shown: number;
    converted: number;
  }>;
};

export function RevenueMetricsPanel({
  totalShown,
  totalRevenue,
  revenuePerVisitor,
  averageOrderValue,
  ordersWithRevenue,
  currency,
  fxAsOf,
  displayCurrency,
  fxRates,
  onDisplayCurrencyChange,
}: {
  totalShown: number;
  totalRevenue: number;
  revenuePerVisitor: number;
  averageOrderValue: number;
  ordersWithRevenue: number;
  currency: string;
  fxAsOf?: string;
  displayCurrency: string;
  fxRates: Record<string, number>;
  onDisplayCurrencyChange?: (currency: string) => void;
}) {
  const hasRevenue = totalRevenue > 0;
  const showingConverted = displayCurrency !== currency;

  const display = (amountUsd: number) =>
    convertFromUsd(amountUsd, displayCurrency, fxRates);

  const formatDisplay = (amountUsd: number) =>
    formatMoney(display(amountUsd), displayCurrency);

  const insight = !totalShown
    ? "Complete a real checkout to start tracking post-purchase revenue. Totals are normalized to USD; use the currency selector to view converted amounts."
    : !hasRevenue
      ? `${totalShown} visitor${totalShown === 1 ? "" : "s"} saw this funnel but no attributed revenue yet.`
      : showingConverted
        ? `This funnel generated ${formatDisplay(totalRevenue)} (${formatMoney(totalRevenue, currency)} normalized) from ${ordersWithRevenue} order${ordersWithRevenue === 1 ? "" : "s"} — ${formatDisplay(revenuePerVisitor)} per visitor shown.`
        : `This funnel generated ${formatDisplay(totalRevenue)} from ${ordersWithRevenue} order${ordersWithRevenue === 1 ? "" : "s"} (${formatDisplay(revenuePerVisitor)} per visitor shown). Subscription trials use the recurring plan price for stats.`;

  return (
    <s-stack direction="block" gap="base">
      <s-box padding="base" border="base" borderRadius="base" background="base">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text type="strong">Revenue performance</s-text>
            <s-stack direction="inline" gap="base" alignItems="center">
              {onDisplayCurrencyChange ? (
                <RevenueCurrencySelector
                  value={displayCurrency}
                  onChange={onDisplayCurrencyChange}
                  fxAsOf={fxAsOf}
                />
              ) : null}
              {hasRevenue ? (
                <s-badge tone="success">Live data</s-badge>
              ) : (
                <s-badge tone="neutral">Awaiting conversions</s-badge>
              )}
            </s-stack>
          </s-stack>
          <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
            <RevenueStatCard
              label="Total revenue"
              value={formatDisplay(totalRevenue)}
              hint={
                showingConverted
                  ? `${formatMoney(totalRevenue, currency)} normalized`
                  : "Attributed post-purchase sales (USD)"
              }
            />
            <RevenueStatCard
              label="Revenue per visitor"
              value={formatDisplay(revenuePerVisitor)}
              hint="Revenue ÷ unique visitors shown"
            />
            <RevenueStatCard
              label="Avg. order value"
              value={
                ordersWithRevenue > 0
                  ? formatDisplay(averageOrderValue)
                  : "—"
              }
              hint="Revenue ÷ orders with revenue"
            />
            <RevenueStatCard
              label="Paying orders"
              value={String(ordersWithRevenue)}
              hint={`Of ${totalShown} visitor${totalShown === 1 ? "" : "s"} shown`}
            />
          </s-grid>
          <s-box padding="base" border="base" borderRadius="base" background="subdued">
            <s-text tone="neutral">{insight}</s-text>
          </s-box>
        </s-stack>
      </s-box>
      {totalShown > 0 && (revenuePerVisitor > 0 || averageOrderValue > 0) ? (
        <HorizontalBarChart
          title="Revenue per visitor vs. avg. order value"
          formatValue={(value) => formatMoney(value, displayCurrency)}
          items={[
            {
              label: `RPV (${formatDisplay(revenuePerVisitor)})`,
              value: Math.max(display(revenuePerVisitor), 0.01),
              tone: "brand",
            },
            {
              label: `AOV (${formatDisplay(averageOrderValue)})`,
              value: Math.max(display(averageOrderValue), 0.01),
              tone: "success",
            },
          ]}
          emptyMessage="No revenue data yet"
        />
      ) : null}
    </s-stack>
  );
}

function RevenueStatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <s-box padding="base" border="base" borderRadius="base" background="subdued">
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

type RevenueFunnelRow = {
  testId: string;
  name: string;
  revenue: number;
  shown: number;
  converted: number;
};

const REVENUE_BAR_COLORS = ["#008060", "#2c6ecb", "#5c6ac4", "#b98900", "#d82c0d"];

/** Vertical bar chart for comparing revenue metrics side by side. */
export function RevenueMetricsBarChart({
  title,
  items,
  formatValue,
  emptyMessage = "No revenue data yet",
}: {
  title: string;
  items: Array<{ label: string; value: number; color?: string }>;
  formatValue: (value: number) => string;
  emptyMessage?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 0.01);
  const chartHeight = 160;

  if (!items.some((i) => i.value > 0)) {
    return (
      <s-box padding="base" border="base" borderRadius="base" background="base">
        <s-stack direction="block" gap="base">
          <s-text type="strong">{title}</s-text>
          <s-text tone="neutral" color="subdued">
            {emptyMessage}
          </s-text>
        </s-stack>
      </s-box>
    );
  }

  return (
    <s-box padding="base" border="base" borderRadius="base" background="base">
      <s-stack direction="block" gap="base">
        <s-text type="strong">{title}</s-text>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-around",
            gap: 16,
            height: chartHeight + 48,
            paddingTop: 8,
          }}
        >
          {items.map((item, index) => {
            const barHeight = Math.max(8, Math.round((item.value / max) * chartHeight));
            const color = item.color ?? REVENUE_BAR_COLORS[index % REVENUE_BAR_COLORS.length];
            return (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <s-text type="strong">{formatValue(item.value)}</s-text>
                <div
                  style={{
                    width: "100%",
                    maxWidth: 72,
                    height: barHeight,
                    background: color,
                    borderRadius: "6px 6px 2px 2px",
                    transition: "height 0.45s ease",
                  }}
                />
                <s-text tone="neutral" color="subdued">
                  {item.label}
                </s-text>
              </div>
            );
          })}
        </div>
      </s-stack>
    </s-box>
  );
}

/** Horizontal bars showing attributed revenue per funnel. */
export function RevenueByFunnelChart({
  rows,
  formatValue,
  title = "Revenue by funnel",
  emptyMessage = "No funnel revenue yet",
}: {
  rows: RevenueFunnelRow[];
  formatValue: (value: number) => string;
  title?: string;
  emptyMessage?: string;
}) {
  const withRevenue = rows.filter((row) => row.revenue > 0);
  const max = Math.max(...withRevenue.map((r) => r.revenue), 1);

  if (!withRevenue.length) {
    return (
      <s-box padding="base" border="base" borderRadius="base" background="base">
        <s-stack direction="block" gap="base">
          <s-text type="strong">{title}</s-text>
          <s-text tone="neutral" color="subdued">
            {emptyMessage}
          </s-text>
        </s-stack>
      </s-box>
    );
  }

  return (
    <s-box padding="base" border="base" borderRadius="base" background="base">
      <s-stack direction="block" gap="base">
        <s-text type="strong">{title}</s-text>
        {withRevenue.map((row, index) => {
          const width = Math.max(4, Math.round((row.revenue / max) * 100));
          const color = REVENUE_BAR_COLORS[index % REVENUE_BAR_COLORS.length];
          return (
            <s-stack key={row.testId} direction="block" gap="small">
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-box inlineSize="160px">
                  <s-text>{row.name}</s-text>
                </s-box>
                <s-text type="strong">{formatValue(row.revenue)}</s-text>
                <s-text tone="neutral" color="subdued">
                  ({row.converted}/{row.shown} converted)
                </s-text>
              </s-stack>
              <div
                style={{
                  height: 12,
                  borderRadius: 6,
                  background: "var(--p-color-bg-surface-secondary, #f1f1f1)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${width}%`,
                    height: "100%",
                    background: color,
                    borderRadius: 6,
                    transition: "width 0.35s ease",
                  }}
                />
              </div>
            </s-stack>
          );
        })}
      </s-stack>
    </s-box>
  );
}

/** Visual revenue section: metric bars, funnel split donut, and per-funnel bars. */
export function RevenueAnalyticsVisuals({
  totalRevenue,
  revenuePerVisitor,
  averageOrderValue,
  ordersWithRevenue,
  funnelRows,
  displayCurrency,
  fxRates,
}: {
  totalRevenue: number;
  revenuePerVisitor: number;
  averageOrderValue: number;
  ordersWithRevenue: number;
  funnelRows: RevenueFunnelRow[];
  displayCurrency: string;
  fxRates: Record<string, number>;
}) {
  const display = (amountUsd: number) =>
    convertFromUsd(amountUsd, displayCurrency, fxRates);
  const formatDisplay = (amountUsd: number) =>
    formatMoney(display(amountUsd), displayCurrency);

  const funnelSegments = funnelRows
    .filter((row) => row.revenue > 0)
    .map((row, index) => ({
      label: row.name,
      value: row.revenue,
      color: REVENUE_BAR_COLORS[index % REVENUE_BAR_COLORS.length],
    }));

  return (
    <s-stack direction="block" gap="base">
      <s-grid gridTemplateColumns="1fr 1fr" gap="base">
        <RevenueMetricsBarChart
          title="Revenue metrics comparison"
          formatValue={formatDisplay}
          items={[
            {
              label: "Total revenue",
              value: Math.max(display(totalRevenue), 0),
              color: "#008060",
            },
            {
              label: "Rev / visitor",
              value: Math.max(display(revenuePerVisitor), 0),
              color: "#2c6ecb",
            },
            {
              label: "Avg. order",
              value: Math.max(display(averageOrderValue), 0),
              color: "#5c6ac4",
            },
          ]}
        />
        <DonutChart
          title="Revenue share by funnel"
          centerValue={formatDisplay(totalRevenue)}
          centerLabel="total"
          emptyMessage="Complete a checkout to see revenue split"
          formatValue={(value) => formatDisplay(value)}
          segments={funnelSegments}
        />
      </s-grid>
      <s-grid gridTemplateColumns="1fr 1fr" gap="base">
        <RevenueByFunnelChart
          rows={funnelRows}
          formatValue={formatDisplay}
        />
        <DonutChart
          title="Paying orders vs. visitors"
          centerValue={String(ordersWithRevenue)}
          centerLabel="orders"
          emptyMessage="No paying orders yet"
          segments={[
            {
              label: "Paying orders",
              value: ordersWithRevenue,
              color: "#008060",
            },
            {
              label: "Non-paying visitors",
              value: Math.max(
                funnelRows.reduce((sum, row) => sum + row.shown, 0) -
                  ordersWithRevenue,
                0,
              ),
              color: "#8c9196",
            },
          ]}
        />
      </s-grid>
    </s-stack>
  );
}

function ConversionStatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <s-box padding="base" border="base" borderRadius="base" background="base">
      <s-stack direction="block" gap="small">
        <s-text tone="neutral" color="subdued">
          {label}
        </s-text>
        <s-heading>{value}</s-heading>
      </s-stack>
    </s-box>
  );
}

export function FunnelAnalyticsPanel({
  testType,
  analytics,
  displayCurrency,
  fxRates,
  onDisplayCurrencyChange,
}: {
  testType: string;
  analytics: AnalyticsDetail;
  displayCurrency: string;
  fxRates: Record<string, number>;
  onDisplayCurrencyChange?: (currency: string) => void;
}) {
  const accepted = analytics.totalAccepted;
  const completed = analytics.totalCompleted;
  const stepBaseline =
    analytics.totalShown > 0 ? analytics.totalShown : undefined;

  const revenuePanel = (
    <RevenueMetricsPanel
      totalShown={analytics.totalShown}
      totalRevenue={analytics.totalRevenue}
      revenuePerVisitor={analytics.revenuePerVisitor}
      averageOrderValue={analytics.averageOrderValue}
      ordersWithRevenue={analytics.ordersWithRevenue}
      currency={analytics.currency}
      fxAsOf={analytics.fxAsOf}
      displayCurrency={displayCurrency}
      fxRates={fxRates}
      onDisplayCurrencyChange={onDisplayCurrencyChange}
    />
  );

  const conversionSummary = (
    <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
      <ConversionStatCard label="Shown" value={String(analytics.totalShown)} />
      <ConversionStatCard
        label="Conversion rate"
        value={`${analytics.conversionRate}%`}
      />
      <ConversionStatCard
        label="Accepted"
        value={String(analytics.totalAccepted)}
      />
      <ConversionStatCard
        label="Declined"
        value={String(analytics.totalDeclined)}
      />
    </s-grid>
  );

  const conversionChart = (
    <ConversionFunnelChart
      shown={analytics.totalShown}
      accepted={accepted}
      declined={analytics.totalDeclined}
      completed={completed}
    />
  );

  const stepsChart = (
    steps: Array<{ step: string; count: number }>,
    title?: string,
  ) => (
    <FunnelStepsChart steps={steps} title={title} baseline={stepBaseline} />
  );

  if (testType === "product_offer") {
    return (
      <s-stack direction="block" gap="base">
        {conversionSummary}
        {revenuePanel}
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          {conversionChart}
          {stepsChart(analytics.funnelSteps, "Offer page views")}
        </s-grid>
      </s-stack>
    );
  }

  if (testType === "trial_unlock") {
    return (
      <s-stack direction="block" gap="base">
        {conversionSummary}
        {revenuePanel}
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          {conversionChart}
          {stepsChart(
            orderSteps(analytics.funnelSteps, TRIAL_STEP_ORDER),
            "Trial funnel steps",
          )}
        </s-grid>
      </s-stack>
    );
  }

  if (testType === "quiz") {
    return (
      <s-stack direction="block" gap="base">
        {conversionSummary}
        {revenuePanel}
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          <QuizOutcomeChart
            qualified={analytics.totalQualified}
            rejected={analytics.totalRejected}
            baseline={stepBaseline}
          />
          {stepsChart(
            orderSteps(analytics.funnelSteps, QUIZ_STEP_ORDER),
            "Quiz funnel steps",
          )}
        </s-grid>
        {conversionChart}
      </s-stack>
    );
  }

  if (testType === "survey") {
    return (
      <s-stack direction="block" gap="base">
        {conversionSummary}
        {revenuePanel}
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          {conversionChart}
          {stepsChart(
            orderSteps(analytics.funnelSteps, SURVEY_STEP_ORDER),
            "Survey funnel steps",
          )}
        </s-grid>
      </s-stack>
    );
  }

  if (testType === "combo") {
    return (
      <s-stack direction="block" gap="base">
        {conversionSummary}
        {revenuePanel}
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          {conversionChart}
          {stepsChart(analytics.funnelSteps, "Combo funnel steps")}
        </s-grid>
        {analytics.comboSplit.length > 0 ? (
          <ComboSplitChart splits={analytics.comboSplit} />
        ) : null}
        {analytics.funnelTypeBreakdown && analytics.funnelTypeBreakdown.length > 0 ? (
          <FunnelTypeBreakdownChart
            breakdown={analytics.funnelTypeBreakdown}
            title="Combo variant performance"
          />
        ) : null}
      </s-stack>
    );
  }

  return (
    <s-stack direction="block" gap="base">
      {conversionSummary}
      {revenuePanel}
      <s-grid gridTemplateColumns="1fr 1fr" gap="base">
        {conversionChart}
        {stepsChart(analytics.funnelSteps)}
      </s-grid>
    </s-stack>
  );
}
