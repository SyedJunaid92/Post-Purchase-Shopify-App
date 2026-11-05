import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { isSupabaseConfigured } from "../lib/supabase.server";
import {
  logAnalyticsEvent,
  type AnalyticsEventType,
} from "../lib/analytics.server";
import {
  authenticatePostPurchaseRequest,
  getShopFromCheckout,
} from "../lib/checkout-auth.server";

const ALLOWED_EVENTS: AnalyticsEventType[] = [
  "test_shown",
  "test_skipped_traffic",
  "step_viewed",
  "question_answered",
  "analyzing_completed",
  "qualified",
  "rejected",
  "offer_accepted",
  "offer_declined",
  "product_auto_added",
  "test_completed",
  "extension_debug",
  "offer_config_loaded",
  "terms_accepted",
  "trial_started",
  "trigger_skipped",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors } = await authenticatePostPurchaseRequest(request);
  return cors(new Response(null, { status: 204 }));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { cors, sessionToken } = await authenticatePostPurchaseRequest(request);
  const body = await request.json();

  if (!isSupabaseConfigured()) {
    return cors(new Response(null, { status: 204 }));
  }

  const shop = getShopFromCheckout(sessionToken, body);
  if (!shop || !body.eventType) {
    return cors(new Response(null, { status: 204 }));
  }

  if (!ALLOWED_EVENTS.includes(body.eventType)) {
    return cors(new Response(null, { status: 400 }));
  }

  logAnalyticsEvent({
    shop,
    testId: body.testId ?? null,
    referenceId: body.referenceId ?? null,
    sessionId: body.sessionId ?? null,
    eventType: body.eventType,
    eventData: body.eventData ?? {},
  }).catch(() => {});

  return cors(new Response(null, { status: 204 }));
};
