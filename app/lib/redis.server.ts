import { Redis } from "@upstash/redis";

let redis: Redis | null | undefined;

export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

export function getRedis(): Redis | null {
  if (redis !== undefined) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redis = null;
    return null;
  }

  redis = new Redis({ url, token });
  return redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const value = await client.get<T>(key);
    return value ?? null;
  } catch (error) {
    console.warn("Redis GET failed:", error);
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await client.set(key, value, { ex: ttlSeconds });
  } catch (error) {
    console.warn("Redis SET failed:", error);
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const client = getRedis();
  if (!client || keys.length === 0) return;

  try {
    await Promise.all(keys.map((key) => client.del(key)));
  } catch (error) {
    console.warn("Redis DEL failed:", error);
  }
}

export const REDIS_KEYS = {
  activeTest: (shop: string) => `offer:active:${shop}`,
  fxUsd: "fx:usd",
  dashboard: (shop: string) => `analytics:dashboard:${shop}`,
} as const;

export const REDIS_TTL = {
  activeTest: 20,
  fxUsd: 60 * 60,
  dashboard: 20,
} as const;
