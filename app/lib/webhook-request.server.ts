import { verifyShopifyWebhook } from "./webhook-auth.server";
import { ensurePrismaTables } from "./prisma-bootstrap.server";

export type ResolvedWebhook = {
  shop: string;
  topic: string;
  webhookId: string;
  payload: unknown;
};

export async function resolveWebhookRequest(
  request: Request,
  options?: { logLabel?: string; hmacOnly?: boolean },
): Promise<ResolvedWebhook> {
  const rawBody = await request.text();

  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    payload = {};
  }

  if (options?.hmacOnly) {
    const verified = verifyShopifyWebhook(rawBody, request);
    if (!verified) {
      throw new Error(
        `${options.logLabel ?? "Webhook"} HMAC verification failed`,
      );
    }
    await ensurePrismaTables();
    return { ...verified, payload };
  }

  await ensurePrismaTables();

  const replayRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: rawBody,
  });

  try {
    const { authenticate } = await import("../shopify.server");
    const ctx = await authenticate.webhook(replayRequest);
    return {
      shop: ctx.shop,
      topic: ctx.topic,
      webhookId: ctx.webhookId,
      payload: ctx.payload ?? payload,
    };
  } catch (error) {
    const fallback = verifyShopifyWebhook(rawBody, request);
    if (fallback) {
      console.warn(
        `${options?.logLabel ?? "Webhook"} used HMAC fallback (session storage unavailable)`,
        { shop: fallback.shop, topic: fallback.topic },
      );
      return { ...fallback, payload };
    }
    throw error;
  }
}

/** Shopify sends slash topics in headers; some SDK paths use SCREAMING_SNAKE. */
export function isComplianceTopic(
  topic: string,
  kind: "customers/data_request" | "customers/redact" | "shop/redact",
): boolean {
  const snake = kind.toUpperCase().replace(/\//g, "_");
  return topic === kind || topic === snake;
}
