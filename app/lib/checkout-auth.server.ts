import { createSecretKey } from "crypto";
import { jwtVerify, type JWTPayload } from "jose";

export type CheckoutSessionToken = JWTPayload & {
  dest?: string;
  sub?: string;
  iss?: string;
  aud?: string;
};

export function corsify(request: Request, response: Response): Response {
  const origin = request.headers.get("Origin");
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    response.headers.set(
      "Access-Control-Expose-Headers",
      "X-Shopify-API-Request-Failure-Reauthorize-Url",
    );
  }
  return response;
}

export function handleCheckoutPreflight(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return corsify(
    request,
    new Response(null, {
      status: 204,
      headers: { "Access-Control-Max-Age": "7200" },
    }),
  );
}

function unauthorized(request: Request, reason: string): Response {
  return corsify(
    request,
    Response.json({ error: "unauthorized", reason }, { status: 401 }),
  );
}

export async function verifyCheckoutSessionToken(
  request: Request,
): Promise<CheckoutSessionToken> {
  const header = request.headers.get("authorization");
  const token = header?.replace(/^Bearer\s+/i, "");
  if (!token) {
    throw unauthorized(request, "missing_token");
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw unauthorized(request, "missing_secret");
  }

  try {
    const { payload } = await jwtVerify(
      token,
      createSecretKey(Buffer.from(secret)),
      {
        algorithms: ["HS256"],
        clockTolerance: 10,
      },
    );
    return payload as CheckoutSessionToken;
  } catch {
    throw unauthorized(request, "invalid_token");
  }
}

export function getShopFromCheckout(
  sessionToken: CheckoutSessionToken,
  body: { shopDomain?: string },
): string | null {
  if (body.shopDomain) {
    return body.shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  if (sessionToken.dest) {
    return sessionToken.dest.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  return null;
}

/**
 * Post-purchase extensions often omit User-Agent or send values flagged by isbot.
 * authenticate.public.checkout rejects those with HTTP 410, so we validate the
 * checkout session JWT directly instead (same as Shopify's decodeSessionToken).
 */
export async function authenticatePostPurchaseRequest(request: Request) {
  const preflight = handleCheckoutPreflight(request);
  if (preflight) {
    throw preflight;
  }

  const sessionToken = await verifyCheckoutSessionToken(request);

  return {
    sessionToken,
    cors: (response: Response) => {
      response.headers.set("Cache-Control", "private, no-store");
      return corsify(request, response);
    },
  };
}
