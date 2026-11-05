import { cacheGet, cacheSet, REDIS_KEYS, REDIS_TTL } from "./redis.server";

const MEMORY_TTL_MS = REDIS_TTL.shopCurrency * 1000;
const NEGATIVE_TTL_MS = 5 * 60 * 1000;

const memory = new Map<string, { at: number; code: string }>();
const missed = new Map<string, number>();

function remember(shop: string, code: string) {
  memory.set(shop, { at: Date.now(), code });
  missed.delete(shop);
  void cacheSet(REDIS_KEYS.shopCurrency(shop), code, REDIS_TTL.shopCurrency);
}

/** Shop currency for catalog prices. Product variant prices are stored in this currency. */
export async function getShopCurrencyCode(shop: string): Promise<string | null> {
  const domain = shop.trim();
  if (!domain) return null;

  const cached = memory.get(domain);
  if (cached && Date.now() - cached.at < MEMORY_TTL_MS) return cached.code;

  const missedAt = missed.get(domain);
  if (missedAt && Date.now() - missedAt < NEGATIVE_TTL_MS) return null;

  const redisHit = await cacheGet<string>(REDIS_KEYS.shopCurrency(domain));
  if (typeof redisHit === "string" && /^[A-Z]{3}$/.test(redisHit)) {
    memory.set(domain, { at: Date.now(), code: redisHit });
    return redisHit;
  }

  try {
    const { unauthenticated } = await import("../shopify.server");
    const { admin } = await unauthenticated.admin(domain);
    const response = await admin.graphql(
      `#graphql
      query ShopCurrency {
        shop {
          currencyCode
        }
      }`,
    );
    const json = (await response.json()) as {
      data?: { shop?: { currencyCode?: string | null } };
    };
    const code = String(json.data?.shop?.currencyCode ?? "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      missed.set(domain, Date.now());
      return null;
    }
    remember(domain, code);
    return code;
  } catch (error) {
    console.warn("getShopCurrencyCode:", error);
    missed.set(domain, Date.now());
    return null;
  }
}
