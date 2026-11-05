import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import type { PrismaClient } from "@prisma/client";
import prisma from "./db.server";
import { BILLING_PLAN, annualPrice } from "./lib/billing.plans";
import { ensurePrismaTables } from "./lib/prisma-bootstrap.server";

// Do not await this at import time. PrismaSessionStorage sleeps 5s between
// connection retries, and a top-level await blocks every request — including
// Shopify webhooks, which must respond within 5 seconds.
export let sessionStorage: PrismaSessionStorage<PrismaClient>;

async function createShopifyApp() {
  // Session storage polls for the Session table on construction. Bootstrap first so
  // cold starts on Vercel do not permanently mark storage as unavailable.
  await ensurePrismaTables();
  sessionStorage = new PrismaSessionStorage(prisma);
  await sessionStorage.isReady();
  return shopifyApp({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
    apiVersion: ApiVersion.April26,
    scopes: process.env.SCOPES?.split(","),
    appUrl: process.env.SHOPIFY_APP_URL || "",
    authPathPrefix: "/auth",
    sessionStorage,
    distribution: AppDistribution.AppStore,
    // App Store apps use token exchange + Shopify managed install by default (no OAuth redirects).
    billing: {
      [BILLING_PLAN.STARTER_MONTHLY]: {
        lineItems: [
          {
            amount: 25,
            currencyCode: "USD",
            interval: BillingInterval.Every30Days,
          },
        ],
      },
      [BILLING_PLAN.STARTER_ANNUAL]: {
        lineItems: [
          {
            amount: annualPrice(25),
            currencyCode: "USD",
            interval: BillingInterval.Annual,
          },
        ],
      },
      [BILLING_PLAN.GROWTH_MONTHLY]: {
        lineItems: [
          {
            amount: 50,
            currencyCode: "USD",
            interval: BillingInterval.Every30Days,
          },
        ],
      },
      [BILLING_PLAN.GROWTH_ANNUAL]: {
        lineItems: [
          {
            amount: annualPrice(50),
            currencyCode: "USD",
            interval: BillingInterval.Annual,
          },
        ],
      },
      [BILLING_PLAN.SCALE_MONTHLY]: {
        lineItems: [
          {
            amount: 100,
            currencyCode: "USD",
            interval: BillingInterval.Every30Days,
          },
        ],
      },
      [BILLING_PLAN.SCALE_ANNUAL]: {
        lineItems: [
          {
            amount: annualPrice(100),
            currencyCode: "USD",
            interval: BillingInterval.Annual,
          },
        ],
      },
    },
    future: {
      expiringOfflineAccessTokens: true,
    },
    ...(process.env.SHOP_CUSTOM_DOMAIN
      ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
      : {}),
    hooks: {
      afterAuth: async ({ session }) => {
        const { syncShopBillingForInstalledShop } =
          await import("./lib/billing-sync.server");
        void syncShopBillingForInstalledShop(session.shop).catch(console.error);
      },
    },
  });
}

type ShopifyApp = Awaited<ReturnType<typeof createShopifyApp>>;

let shopifyPromise: Promise<ShopifyApp> | null = null;

function appReady(): Promise<ShopifyApp> {
  if (!shopifyPromise) {
    shopifyPromise = createShopifyApp().catch((error) => {
      shopifyPromise = null;
      throw error;
    });
  }
  return shopifyPromise;
}

export const apiVersion = ApiVersion.April26;

export const authenticate = {
  admin: (request: Request) =>
    appReady().then((app) => app.authenticate.admin(request)),
  webhook: (request: Request) =>
    appReady().then((app) => app.authenticate.webhook(request)),
};

export const unauthenticated = {
  admin: (shop: string) =>
    appReady().then((app) => app.unauthenticated.admin(shop)),
};

export const login = (request: Request) =>
  appReady().then((app) => app.login(request));

export const registerWebhooks = (
  ...args: Parameters<ShopifyApp["registerWebhooks"]>
) => appReady().then((app) => app.registerWebhooks(...args));

export async function addDocumentResponseHeaders(
  request: Request,
  headers: Headers,
) {
  const app = await appReady();
  app.addDocumentResponseHeaders(request, headers);
}

export default appReady;
