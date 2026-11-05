import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { isSupabaseConfigured, logPostPurchaseEvent } from "../lib/supabase.server";
import {
  authenticatePostPurchaseRequest,
  getShopFromCheckout,
} from "../lib/checkout-auth.server";

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
  if (!shop || !body.referenceId || !body.event) {
    return cors(new Response(null, { status: 204 }));
  }

  logPostPurchaseEvent({
    shop,
    reference_id: body.referenceId,
    event_type: body.event,
  }).catch(() => {});

  return cors(new Response(null, { status: 204 }));
};
