import db from "../db.server";

let schemaReady: Promise<void> | null = null;

/**
 * Ensures Prisma-managed tables exist in Postgres.
 * Production uses Supabase SQL for app data; Session/ProcessedWebhook may be missing
 * if Prisma migrations were never deployed.
 */
export function ensurePrismaTables(): Promise<void> {
  if (!schemaReady) {
    schemaReady = bootstrap().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function bootstrap(): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Session" (
      id text PRIMARY KEY,
      shop text NOT NULL,
      state text NOT NULL,
      "isOnline" boolean NOT NULL DEFAULT false,
      scope text,
      expires timestamptz,
      "accessToken" text NOT NULL,
      "userId" bigint,
      "firstName" text,
      "lastName" text,
      email text,
      "accountOwner" boolean NOT NULL DEFAULT false,
      locale text,
      collaborator boolean DEFAULT false,
      "emailVerified" boolean DEFAULT false,
      "refreshToken" text,
      "refreshTokenExpires" timestamptz
    )
  `);

  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Session_shop_idx" ON "Session" (shop)
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProcessedWebhook" (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "webhookId" text NOT NULL UNIQUE,
      shop text NOT NULL,
      topic text NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProcessedWebhook_shop_idx"
    ON "ProcessedWebhook" (shop)
  `);
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProcessedWebhook_shop_topic_idx"
    ON "ProcessedWebhook" (shop, topic)
  `);
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProcessedWebhook_createdAt_idx"
    ON "ProcessedWebhook" ("createdAt")
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ShopBilling" (
      shop text PRIMARY KEY,
      "hasActivePayment" boolean NOT NULL DEFAULT false,
      "subscriptionId" text,
      "subscriptionName" text,
      "subscriptionStatus" text,
      "planTier" text,
      "currentPeriodEnd" timestamptz,
      "trialDays" integer,
      "isTest" boolean NOT NULL DEFAULT false,
      "lastPaymentIssue" text,
      "lastWebhookAt" timestamptz,
      "lastSyncedAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )
  `);
}
