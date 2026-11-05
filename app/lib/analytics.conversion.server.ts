import { convertToUsd } from "./analytics.format";
import { getUsdFxRates } from "./fx.server";
import { getShopCurrencyCode } from "./shop-currency.server";
import type {
  ComboTestConfig,
  ProductFields,
  ProductOfferConfig,
  ScoredQuizConfig,
  SurveyRewardConfig,
  TrialUnlockConfig,
} from "./test-config.types";
import { getTest } from "./tests.server";

const CONVERSION_EVENTS = new Set([
  "offer_accepted",
  "trial_started",
  "product_auto_added",
]);

export type ConversionEnrichInput = {
  shop: string;
  testId?: string | null;
  referenceId?: string | null;
  eventType: string;
  eventData?: Record<string, unknown>;
};

export type ConversionOrderRow = {
  reference_id: string;
  test_id: string | null;
  amount: string | null;
  currency: string | null;
  amount_usd: string | null;
};

export function normalizeEventData(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function parseEventAmount(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!/^[0-9]+(\.[0-9]+)?$/.test(raw)) return null;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readCurrency(eventData: Record<string, unknown>): string | null {
  if (typeof eventData.currency !== "string") return null;
  const code = eventData.currency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function hasReportableUsd(eventData: Record<string, unknown>): boolean {
  const amountUsd = parseEventAmount(eventData.amountUsd);
  if (amountUsd != null && amountUsd > 0) return true;
  const amount = parseEventAmount(eventData.amount);
  if (amount == null || amount <= 0) return false;
  return (readCurrency(eventData) ?? "USD") === "USD";
}

async function usdString(
  amount: number,
  currency: string,
): Promise<string | null> {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  if (code === "USD") return amount.toFixed(2);
  try {
    const fx = await getUsdFxRates();
    const usd = convertToUsd(amount, code, fx.rates);
    if (!Number.isFinite(usd) || usd <= 0) return null;
    return usd.toFixed(2);
  } catch {
    return null;
  }
}

export function conversionRowFromEventData(
  referenceId: string,
  testId: string | null,
  eventData: Record<string, unknown>,
): ConversionOrderRow {
  const amount =
    eventData.amount != null ? String(eventData.amount).trim() : null;
  const currency =
    typeof eventData.currency === "string" ? eventData.currency.trim() : null;
  const amountUsd =
    eventData.amountUsd != null ? String(eventData.amountUsd).trim() : null;

  return {
    reference_id: referenceId,
    test_id: testId,
    amount: amount || null,
    currency: currency || null,
    amount_usd: amountUsd || null,
  };
}

function catalogAmount(product: ProductFields): number | null {
  const base = product.productPrice;
  if (!base) return null;

  const price = parseFloat(base);
  if (!Number.isFinite(price) || price <= 0) return null;

  const discount = product.discountPercentage ?? 0;
  const final = discount > 0 ? price * (1 - discount / 100) : price;
  if (!Number.isFinite(final) || final <= 0) return null;
  return final;
}

function productFieldsForTest(
  testType: string,
  config: unknown,
  comboVariant?: unknown,
): ProductFields | null {
  if (!config || typeof config !== "object") return null;

  if (testType === "product_offer") {
    return config as ProductOfferConfig;
  }

  if (testType === "trial_unlock") {
    return (config as TrialUnlockConfig).product ?? null;
  }

  if (testType === "quiz") {
    return (config as ScoredQuizConfig).passProduct ?? null;
  }

  if (testType === "survey") {
    return (config as SurveyRewardConfig).rewardProduct ?? null;
  }

  if (testType === "combo") {
    const combo = config as ComboTestConfig;
    const variant = typeof comboVariant === "string" ? comboVariant : null;
    if (variant === "quiz") return combo.quiz?.passProduct ?? null;
    if (variant === "survey") return combo.survey?.rewardProduct ?? null;
    return combo.trialUnlock?.product ?? null;
  }

  return null;
}

export async function enrichConversionEventData(
  event: ConversionEnrichInput,
): Promise<Record<string, unknown>> {
  const data = { ...(event.eventData ?? {}) };
  if (!CONVERSION_EVENTS.has(event.eventType)) return data;

  const storedUsd = parseEventAmount(data.amountUsd);
  if (storedUsd != null && storedUsd > 0) return data;

  const amount = parseEventAmount(data.amount);
  if (amount != null && amount > 0) {
    const currency = readCurrency(data) ?? "USD";
    const amountUsd = await usdString(amount, currency);
    if (!amountUsd) return data;
    return { ...data, currency, amountUsd };
  }

  if (!event.testId) return data;

  try {
    const test = await getTest(event.shop, event.testId);
    if (!test) return data;

    const product = productFieldsForTest(
      test.type,
      test.config,
      data.comboVariant,
    );
    const price = product ? catalogAmount(product) : null;
    if (price == null || !product) return data;

    const currency = await getShopCurrencyCode(event.shop);
    if (!currency) return data;

    const amountUsd = await usdString(price, currency);
    const isSubscription = Boolean(product.sellingPlanLegacyId);

    return {
      ...data,
      amount: price.toFixed(2),
      currency,
      ...(amountUsd ? { amountUsd } : {}),
      ...(isSubscription
        ? {
            revenueBasis:
              typeof data.revenueBasis === "string"
                ? data.revenueBasis
                : "subscription_recurring",
            chargeToday:
              typeof data.chargeToday === "string" ? data.chargeToday : "0",
          }
        : {}),
    };
  } catch {
    return data;
  }
}

export async function resolveConversionOrderRow(
  shop: string,
  row: {
    reference_id: string;
    test_id: string | null;
    event_type: string;
    event_data: unknown;
  },
): Promise<ConversionOrderRow> {
  const eventData = normalizeEventData(row.event_data);

  if (hasReportableUsd(eventData)) {
    return conversionRowFromEventData(
      row.reference_id,
      row.test_id,
      eventData,
    );
  }

  const enriched = await enrichConversionEventData({
    shop,
    testId: row.test_id,
    referenceId: row.reference_id,
    eventType: row.event_type,
    eventData,
  });

  return conversionRowFromEventData(
    row.reference_id,
    row.test_id,
    enriched,
  );
}
