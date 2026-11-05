import crypto from "crypto";

export type VerifiedWebhook = {
  shop: string;
  topic: string;
  webhookId: string;
};

/**
 * Verifies Shopify webhook HMAC without touching session storage.
 * Used as a fallback when Prisma session storage is unavailable (e.g. on uninstall).
 */
export function verifyShopifyWebhook(
  rawBody: string,
  request: Request,
): VerifiedWebhook | null {
  const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
  const shop = request.headers.get("X-Shopify-Shop-Domain");
  const topic = request.headers.get("X-Shopify-Topic");
  const webhookId = request.headers.get("X-Shopify-Webhook-Id");
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!hmac || !shop || !topic || !secret) return null;

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const expected = Buffer.from(digest, "utf8");
  const received = Buffer.from(hmac, "utf8");
  if (expected.length !== received.length) return null;
  if (!crypto.timingSafeEqual(expected, received)) return null;

  return {
    shop,
    topic,
    webhookId: webhookId ?? `header-${shop}-${Date.now()}`,
  };
}
