import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { isSupabaseConfigured } from "../lib/supabase.server";
import { getActiveTestCached } from "../lib/offer-cache.server";
import { buildFlowFromTest, getSelectedOffer } from "../offer.server";
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
    return cors(Response.json({ token: null }, { status: 400 }));
  }

  const shop = getShopFromCheckout(sessionToken, body);
  if (!shop) {
    return cors(Response.json({ token: null }, { status: 400 }));
  }

  const test = await getActiveTestCached(shop);
  const payload = test ? buildFlowFromTest(test, body.referenceId) : null;
  const offers = payload?.offers ?? [];
  const selectedOffer = getSelectedOffer(offers, body.changes);

  if (!selectedOffer || !test) {
    return cors(Response.json({ token: null }, { status: 400 }));
  }

  const token = jwt.sign(
    {
      iss: process.env.SHOPIFY_API_KEY,
      jti: uuidv4(),
      iat: Date.now(),
      sub: body.referenceId,
      changes: selectedOffer.changes,
    },
    process.env.SHOPIFY_API_SECRET!,
  );

  return cors(Response.json({ token }));
};
