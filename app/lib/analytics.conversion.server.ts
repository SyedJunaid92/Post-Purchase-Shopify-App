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

function hasPositiveStoredAmount(eventData: Record<string, unknown>): boolean {
  const amount = parseEventAmount(eventData.amount);
  if (amount != null && amount > 0) return true;
  const amountUsd = parseEventAmount(eventData.amountUsd);
  return amountUsd != null && amountUsd > 0;
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

function priceFromProductFields(
  product: ProductFields,
): { amount: string; amountUsd: string; currency: string } | null {
  const base = product.productPrice;
  if (!base) return null;

  const price = parseFloat(base);
  if (!Number.isFinite(price) || price <= 0) return null;

  const discount = product.discountPercentage ?? 0;
  const final = discount > 0 ? price * (1 - discount / 100) : price;
  if (!Number.isFinite(final) || final <= 0) return null;

  const amount = final.toFixed(2);
  return { amount, amountUsd: amount, currency: "USD" };
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

  const existing = parseEventAmount(data.amount);
  if (existing != null && existing > 0) return data;

  if (!event.testId) return data;

  try {
    const test = await getTest(event.shop, event.testId);
    if (!test) return data;

    const product = productFieldsForTest(
      test.type,
      test.config,
      data.comboVariant,
    );
    const priced = product ? priceFromProductFields(product) : null;
    if (!priced) return data;

    const isSubscription = Boolean(product?.sellingPlanLegacyId);

    return {
      ...data,
      amount: priced.amount,
      currency:
        typeof data.currency === "string" && data.currency.trim()
          ? data.currency
          : priced.currency,
      amountUsd:
        parseEventAmount(data.amountUsd) != null &&
        parseEventAmount(data.amountUsd)! > 0
          ? String(data.amountUsd)
          : priced.amountUsd,
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

  if (hasPositiveStoredAmount(eventData)) {
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
