export function formatMoney(amount: number, currency = "USD"): string {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.length === 3 ? currency : "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

/** Rates map: units of each currency per 1 USD (Frankfurter / ECB). */
export function convertFromUsd(
  amountUsd: number,
  targetCurrency: string,
  rates: Record<string, number>,
): number {
  if (!Number.isFinite(amountUsd)) return 0;
  const code = targetCurrency.toUpperCase();
  if (code === "USD") return amountUsd;
  const rate = rates[code];
  if (!rate || !Number.isFinite(rate)) return amountUsd;
  return amountUsd * rate;
}

export function convertToUsd(
  amount: number,
  sourceCurrency: string,
  rates: Record<string, number>,
): number {
  if (!Number.isFinite(amount)) return 0;
  const code = sourceCurrency.toUpperCase();
  if (code === "USD") return amount;
  const rate = rates[code];
  if (!rate || !Number.isFinite(rate)) {
    throw new Error(`Missing FX rate for ${code}`);
  }
  return amount / rate;
}

export function formatUsdForDisplay(
  amountUsd: number,
  displayCurrency: string,
  rates: Record<string, number>,
): string {
  return formatMoney(
    convertFromUsd(amountUsd, displayCurrency, rates),
    displayCurrency,
  );
}

export function computeRevenuePerVisitor(
  totalRevenue: number,
  visitors: number,
): number {
  if (visitors <= 0) return 0;
  return totalRevenue / visitors;
}

export function computeAverageOrderValue(
  totalRevenue: number,
  ordersWithRevenue: number,
): number {
  if (ordersWithRevenue <= 0) return 0;
  return totalRevenue / ordersWithRevenue;
}
