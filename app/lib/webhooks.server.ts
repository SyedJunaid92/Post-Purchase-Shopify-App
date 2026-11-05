import { Prisma } from "@prisma/client";
import db from "../db.server";
import { ensurePrismaTables } from "./prisma-bootstrap.server";
import { verifyShopifyWebhook } from "./webhook-auth.server";
import { delay, keepFunctionAlive } from "./wait-until.server";

/** Shopify fails the delivery if we don't ACK within ~5s. Leave headroom under 6s. */
const WEBHOOK_ACK_BUDGET_MS = 4_500;
/** Cap how long a webhook HTTP handler waits before answering. */
const WEBHOOK_HTTP_ACK_MS = 1_000;

type WebhookHandlerOptions = {
  defer?: boolean;
  /**
   * Caller already sent the HTTP response. Run dedup and the handler to
   * completion inside the existing waitUntil task.
   */
  background?: boolean;
  tolerateDedupErrors?: boolean;
  /** Re-run handler when Shopify retries the same webhook ID (e.g. after a timeout). */
  rerunOnDuplicate?: boolean;
};

export type AcceptedWebhook = {
  shop: string;
  topic: string;
  webhookId: string;
  payload: unknown;
};

/**
 * Verify the Shopify HMAC and respond 200 immediately.
 * Dedup and the handler still run — after the response — so a cold database
 * or Admin API call cannot burn Shopify's 5 second delivery limit.
 */
export async function acceptShopifyWebhook(
  request: Request,
  options: {
    logLabel: string;
    handler: (ctx: AcceptedWebhook) => Promise<void>;
    tolerateDedupErrors?: boolean;
    rerunOnDuplicate?: boolean;
  },
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  const rawBody = await request.text();
  const verified = verifyShopifyWebhook(rawBody, request);
  if (!verified) {
    console.error(`${options.logLabel} HMAC verification failed`);
    return new Response(null, { status: 401 });
  }

  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    payload = {};
  }

  const ctx: AcceptedWebhook = { ...verified, payload };

  const work = (async () => {
    await ensurePrismaTables();
    await processWebhookOnce(
      ctx.webhookId,
      ctx.shop,
      ctx.topic,
      () => options.handler(ctx),
      {
        background: true,
        tolerateDedupErrors: options.tolerateDedupErrors,
        rerunOnDuplicate: options.rerunOnDuplicate,
      },
    );
  })();

  // Registered before we respond so the handler keeps running on Vercel.
  keepFunctionAlive(work);

  let failed = false;
  const outcome = await Promise.race([
    work.then(
      () => "done" as const,
      (error) => {
        failed = true;
        console.error(`${options.logLabel} failed:`, error);
        return "done" as const;
      },
    ),
    delay(WEBHOOK_HTTP_ACK_MS).then(() => "pending" as const),
  ]);

  // A fast failure still returns 500 so Shopify retries. Slow work answers 200
  // and finishes after the response, instead of hitting Shopify's 5s timeout.
  if (outcome === "done" && failed) {
    return new Response(null, { status: 500 });
  }

  return new Response(null, { status: 200 });
}

function isMissingWebhookTable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2010")
  );
}

function startHandler(
  handler: () => Promise<void>,
  shop: string,
  topic: string,
) {
  return Promise.resolve()
    .then(() => handler())
    .catch((error) => {
      console.error(`Webhook handler failed for ${shop} (${topic}):`, error);
      throw error;
    });
}

async function runWithAckBudget(work: Promise<void>): Promise<void> {
  const completed = work.then(() => "done" as const);
  const outcome = await Promise.race([
    completed,
    delay(WEBHOOK_ACK_BUDGET_MS).then(() => "timeout" as const),
  ]);

  if (outcome === "timeout") {
    keepFunctionAlive(work);
    void completed.catch(() => {});
    return;
  }

  await completed;
}

function acknowledged(): Response {
  return new Response(null, { status: 200 });
}

async function finishWork(
  work: Promise<void>,
  options?: WebhookHandlerOptions,
): Promise<Response> {
  if (options?.background) {
    await work;
    return acknowledged();
  }
  if (options?.defer) {
    keepFunctionAlive(work);
    return acknowledged();
  }
  await runWithAckBudget(work);
  return acknowledged();
}

export async function processWebhookOnce(
  webhookId: string,
  shop: string,
  topic: string,
  handler: () => Promise<void>,
  options?: WebhookHandlerOptions,
): Promise<Response> {
  const run = () => startHandler(handler, shop, topic);

  try {
    await db.processedWebhook.create({
      data: { webhookId, shop, topic },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      console.log(
        `Skipping duplicate webhook ${webhookId} for ${shop} (${topic})`,
      );
      if (options?.rerunOnDuplicate) {
        return finishWork(run(), options);
      }
      return acknowledged();
    }

    if (isMissingWebhookTable(error) || options?.tolerateDedupErrors) {
      if (!isMissingWebhookTable(error)) {
        console.warn(
          `Webhook dedup insert failed for ${webhookId} (${topic}) — continuing`,
          error,
        );
      } else {
        console.warn(
          "ProcessedWebhook table missing — processing without dedup.",
        );
      }
      return finishWork(run(), options);
    }

    throw error;
  }

  return finishWork(run(), options);
}
