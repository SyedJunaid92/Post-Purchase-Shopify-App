import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { isSupabaseConfigured } from "../lib/supabase.server";
import { logAnalyticsEvent } from "../lib/analytics.server";
import {
  getActiveTestCached,
  getOfferPayloadForShop,
} from "../lib/offer-cache.server";
import {
  authenticatePostPurchaseRequest,
  getShopFromCheckout,
} from "../lib/checkout-auth.server";
import type { PurchaseLineItem } from "../lib/funnel-triggers.types";
import { shouldShowFunnelForPurchase } from "../lib/funnel-triggers.server";

function parseLineItems(raw: unknown): PurchaseLineItem[] {
  if (!Array.isArray(raw)) return [];
  const items: PurchaseLineItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<PurchaseLineItem>;
    const productId = Number(row.productId);
    if (!Number.isFinite(productId)) continue;
    const parsed: PurchaseLineItem = { productId };
    if (row.variantId !== undefined) parsed.variantId = Number(row.variantId);
    if (row.quantity !== undefined) parsed.quantity = Number(row.quantity);
    items.push(parsed);
  }
  return items;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors } = await authenticatePostPurchaseRequest(request);
  return cors(new Response(null, { status: 204 }));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { cors, sessionToken } = await authenticatePostPurchaseRequest(request);
  const body = await request.json();

  if (!isSupabaseConfigured()) {
    return cors(
      Response.json({ enabled: false, offers: [], trafficPercentage: 0 }),
    );
  }

  const shop = getShopFromCheckout(sessionToken, body);
  if (!shop) {
    return cors(
      Response.json({ enabled: false, offers: [], trafficPercentage: 0 }),
    );
  }

  const lineItems = parseLineItems(body.lineItems);
  const payload = await getOfferPayloadForShop(
    shop,
    body.referenceId,
    lineItems,
  );

  if (!payload) {
    const activeTest = await getActiveTestCached(shop);
    if (
      activeTest &&
      activeTest.triggers.productCollectionEnabled &&
      lineItems.length > 0 &&
      !shouldShowFunnelForPurchase(activeTest.triggers, lineItems)
    ) {
      logAnalyticsEvent({
        shop,
        testId: activeTest.id,
        referenceId: body.referenceId,
        eventType: "trigger_skipped",
        eventData: { reason: "product_collection_mismatch" },
      }).catch(() => {});
    }

    return cors(
      Response.json({ enabled: false, offers: [], trafficPercentage: 0 }),
    );
  }

  logAnalyticsEvent({
    shop,
    testId: payload.comboParentId ?? payload.testId,
    referenceId: body.referenceId,
    eventType: "offer_config_loaded",
    eventData: {
      testType: payload.testType,
      testName: payload.testName,
      comboVariant: payload.comboVariant,
    },
  }).catch(() => {});

  return cors(Response.json(payload));
};
