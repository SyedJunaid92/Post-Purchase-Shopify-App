import { computeAverageOrderValue, convertToUsd } from "./analytics.format";
import { REPORTING_CURRENCY, type FxSnapshot } from "./fx.constants";
import { getUsdFxRates } from "./fx.server";

export type ConversionOrderRow = {
  referenceId: string;
  testId?: string | null;
  amount: number | null;
  currency: string | null;
  amountUsd: number | null;
};

export type RevenueStats = {
  totalRevenue: number;
  ordersWithRevenue: number;
  currency: typeof REPORTING_CURRENCY;
  fxAsOf: string;
};

function parseNumeric(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  if (!/^[0-9]+(\.[0-9]+)?$/.test(value)) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function orderAmountUsd(
  row: ConversionOrderRow,
  rates: Record<string, number>,
): number {
  if (row.amountUsd != null && Number.isFinite(row.amountUsd) && row.amountUsd >= 0) {
    return row.amountUsd;
  }

  if (row.amount == null || row.amount <= 0) return 0;

  const currency = (row.currency || REPORTING_CURRENCY).toUpperCase();
  if (currency === REPORTING_CURRENCY) return row.amount;

  try {
    return convertToUsd(row.amount, currency, rates);
  } catch {
    return row.amount;
  }
}

export function aggregateRevenueOrders(
  rows: ConversionOrderRow[],
  fx: FxSnapshot,
): RevenueStats {
  let totalRevenue = 0;
  let ordersWithRevenue = 0;

  for (const row of rows) {
    const usd = orderAmountUsd(row, fx.rates);
    if (usd > 0) {
      totalRevenue += usd;
      ordersWithRevenue += 1;
    }
  }

  return {
    totalRevenue,
    ordersWithRevenue,
    currency: REPORTING_CURRENCY,
    fxAsOf: fx.asOf,
  };
}

export function mapConversionOrderRows(
  rows: Array<{
    reference_id: string;
    test_id?: string | null;
    amount: string | null;
    currency: string | null;
    amount_usd: string | null;
  }>,
): ConversionOrderRow[] {
  return rows.map((row) => ({
    referenceId: row.reference_id,
    testId: row.test_id ?? null,
    amount: parseNumeric(row.amount),
    currency: row.currency,
    amountUsd: parseNumeric(row.amount_usd),
  }));
}

export async function buildRevenueStats(
  rows: ConversionOrderRow[],
): Promise<RevenueStats> {
  const fx = await getUsdFxRates();
  return aggregateRevenueOrders(rows, fx);
}

export function buildRevenueStatsWithFx(
  rows: ConversionOrderRow[],
  fx: FxSnapshot,
): RevenueStats {
  return aggregateRevenueOrders(rows, fx);
}

export function summarizeRevenueByTest(
  rows: ConversionOrderRow[],
  fx: FxSnapshot,
): Map<
  string,
  {
    totalRevenue: number;
    ordersWithRevenue: number;
    revenuePerVisitor: (shown: number) => number;
    averageOrderValue: number;
  }
> {
  const byTest = new Map<string, ConversionOrderRow[]>();

  for (const row of rows) {
    if (!row.testId) continue;
    const list = byTest.get(row.testId) ?? [];
    list.push(row);
    byTest.set(row.testId, list);
  }

  const summaries = new Map<
    string,
    {
      totalRevenue: number;
      ordersWithRevenue: number;
      revenuePerVisitor: (shown: number) => number;
      averageOrderValue: number;
    }
  >();

  for (const [testId, testRows] of byTest) {
    const stats = aggregateRevenueOrders(testRows, fx);
    summaries.set(testId, {
      totalRevenue: stats.totalRevenue,
      ordersWithRevenue: stats.ordersWithRevenue,
      revenuePerVisitor: (shown: number) =>
        shown > 0 ? stats.totalRevenue / shown : 0,
      averageOrderValue: computeAverageOrderValue(
        stats.totalRevenue,
        stats.ordersWithRevenue,
      ),
    });
  }

  return summaries;
}
