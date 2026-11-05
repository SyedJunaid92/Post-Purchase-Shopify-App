import type { PostPurchaseFlowPayload } from "../offer.server";
import { buildFlowFromTest } from "../offer.server";
import { shouldShowFunnelForPurchase } from "./funnel-triggers.server";
import type { PurchaseLineItem } from "./funnel-triggers.types";
import {
  cacheDel,
  cacheGet,
  cacheSet,
  REDIS_KEYS,
  REDIS_TTL,
} from "./redis.server";
import { getActiveTest, type Test } from "./tests.server";

type CacheEntry = {
  test: Test | null;
  expiresAt: number;
};

type RedisActiveTest = {
  test: Test | null;
};

const CACHE_TTL_MS = REDIS_TTL.activeTest * 1000;
const offerCache = new Map<string, CacheEntry>();

export async function getActiveTestCached(shop: string): Promise<Test | null> {
  const now = Date.now();
  const local = offerCache.get(shop);
  if (local && local.expiresAt > now) {
    return local.test;
  }

  const redisHit = await cacheGet<RedisActiveTest>(REDIS_KEYS.activeTest(shop));
  if (redisHit && typeof redisHit === "object" && "test" in redisHit) {
    offerCache.set(shop, {
      test: redisHit.test,
      expiresAt: now + CACHE_TTL_MS,
    });
    return redisHit.test;
  }

  const test = await getActiveTest(shop);
  const entry = { test, expiresAt: now + CACHE_TTL_MS };
  offerCache.set(shop, entry);
  void cacheSet(
    REDIS_KEYS.activeTest(shop),
    { test } satisfies RedisActiveTest,
    REDIS_TTL.activeTest,
  );

  return test;
}

export async function getOfferPayloadForShop(
  shop: string,
  referenceId?: string,
  lineItems?: PurchaseLineItem[],
): Promise<PostPurchaseFlowPayload | null> {
  const test = await getActiveTestCached(shop);
  if (!test) return null;

  if (test.triggers.productCollectionEnabled) {
    if (!lineItems?.length) return null;
    if (!shouldShowFunnelForPurchase(test.triggers, lineItems)) return null;
  }

  return buildFlowFromTest(test, referenceId);
}

export function invalidateOfferCache(shop: string): void {
  offerCache.delete(shop);
  void cacheDel(REDIS_KEYS.activeTest(shop), REDIS_KEYS.dashboard(shop));
}

export async function invalidateOfferCacheNow(shop: string): Promise<void> {
  offerCache.delete(shop);
  await cacheDel(REDIS_KEYS.activeTest(shop), REDIS_KEYS.dashboard(shop));
}
