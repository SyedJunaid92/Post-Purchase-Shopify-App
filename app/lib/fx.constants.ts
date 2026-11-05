export const REPORTING_CURRENCY = "USD";

export const DISPLAY_CURRENCIES = [
  "USD",
  "GBP",
  "EUR",
  "AUD",
  "CAD",
  "NZD",
  "JPY",
  "INR",
  "SGD",
  "HKD",
  "CHF",
  "AED",
] as const;

export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export type FxSnapshot = {
  base: typeof REPORTING_CURRENCY;
  asOf: string;
  rates: Record<string, number>;
};
