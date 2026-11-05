import {
  DISPLAY_CURRENCIES,
  REPORTING_CURRENCY,
  type FxSnapshot,
} from "./fx.constants";
import { cacheGet, cacheSet, REDIS_KEYS, REDIS_TTL } from "./redis.server";

export { REPORTING_CURRENCY, DISPLAY_CURRENCIES, type FxSnapshot };

const CACHE_TTL_MS = REDIS_TTL.fxUsd * 1000;
let cachedFx: { at: number; data: FxSnapshot } | null = null;

const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  GBP: 0.79,
  EUR: 0.92,
  AUD: 1.55,
  CAD: 1.36,
  NZD: 1.68,
  JPY: 150,
  INR: 83,
  SGD: 1.34,
  HKD: 7.8,
  CHF: 0.88,
  AED: 3.67,
};

function normalizeRates(
  rates: Record<string, number>,
): Record<string, number> {
  return { USD: 1, ...rates };
}

export async function getUsdFxRates(): Promise<FxSnapshot> {
  if (cachedFx && Date.now() - cachedFx.at < CACHE_TTL_MS) {
    return cachedFx.data;
  }

  const redisHit = await cacheGet<FxSnapshot>(REDIS_KEYS.fxUsd);
  if (redisHit?.rates && redisHit.asOf) {
    cachedFx = { at: Date.now(), data: redisHit };
    return redisHit;
  }

  try {
    const symbols = DISPLAY_CURRENCIES.filter((c) => c !== "USD").join(",");
    const response = await fetch(
      `https://api.frankfurter.app/latest?from=USD&to=${symbols}`,
      { headers: { Accept: "application/json" } },
    );

    if (!response.ok) {
      throw new Error(`FX API ${response.status}`);
    }

    const payload = (await response.json()) as {
      date?: string;
      rates?: Record<string, number>;
    };

    const data: FxSnapshot = {
      base: REPORTING_CURRENCY,
      asOf: payload.date ?? new Date().toISOString().slice(0, 10),
      rates: normalizeRates({
        ...FALLBACK_RATES,
        ...(payload.rates ?? {}),
      }),
    };

    cachedFx = { at: Date.now(), data };
    void cacheSet(REDIS_KEYS.fxUsd, data, REDIS_TTL.fxUsd);
    return data;
  } catch (error) {
    console.error("getUsdFxRates:", error);
    return {
      base: REPORTING_CURRENCY,
      asOf: new Date().toISOString().slice(0, 10),
      rates: { ...FALLBACK_RATES },
    };
  }
}
