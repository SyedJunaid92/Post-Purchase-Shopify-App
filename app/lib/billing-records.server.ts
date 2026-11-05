import type { BillingCheckResponseObject } from "@shopify/shopify-api";
import type { ShopBilling } from "@prisma/client";
import db from "../db.server";
import { resolvePlanTier } from "./billing.plans";

export type SubscriptionStatus =
  | "ACTIVE"
  | "CANCELLED"
  | "PENDING"
  | "DECLINED"
  | "EXPIRED"
  | "FROZEN"
  | "ACCEPTED";

type WebhookAppSubscription = {
  admin_graphql_api_id?: string;
  name?: string;
  status?: string;
  updated_at?: string;
};

type UpsertShopBillingInput = {
  shop: string;
  hasActivePayment: boolean;
  subscriptionId?: string | null;
  subscriptionName?: string | null;
  subscriptionStatus?: string | null;
  planTier?: string | null;
  currentPeriodEnd?: Date | null;
  trialDays?: number | null;
  isTest?: boolean;
  lastPaymentIssue?: string | null;
  lastWebhookAt?: Date;
  lastSyncedAt?: Date;
};

export function paymentIssueForStatus(status: string | null | undefined): string | null {
  switch (status) {
    case "FROZEN":
      return "Your last payment failed or was declined. Update your payment method in Shopify Billing to restore access.";
    case "DECLINED":
      return "The subscription charge was declined. Choose a plan below to subscribe again.";
    case "EXPIRED":
      return "The subscription was not approved in time. Choose a plan below to subscribe again.";
    case "CANCELLED":
      return "Your subscription is cancelled. Choose a plan below to restore access.";
    case "PENDING":
      return "Your subscription is pending approval. Complete checkout in Shopify to activate your plan.";
    default:
      return null;
  }
}

function parsePeriodEnd(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function gqlIdToNumericId(gqlId: string | null | undefined): string | null {
  if (!gqlId) return null;
  const match = gqlId.match(/\/(\d+)\s*$/);
  return match?.[1] ?? gqlId;
}

export async function getShopBillingRecord(
  shop: string,
): Promise<ShopBilling | null> {
  try {
    return await db.shopBilling.findUnique({ where: { shop } });
  } catch (error) {
    console.error("getShopBillingRecord failed:", error);
    return null;
  }
}

async function upsertShopBilling(input: UpsertShopBillingInput): Promise<void> {
  const { shop, lastPaymentIssue, ...rest } = input;

  try {
    await db.shopBilling.upsert({
      where: { shop },
      create: {
        shop,
        ...rest,
        lastPaymentIssue: lastPaymentIssue ?? null,
      },
      update: {
        ...rest,
        ...(lastPaymentIssue !== undefined ? { lastPaymentIssue } : {}),
      },
    });
  } catch (error) {
    console.error("upsertShopBilling failed:", error);
  }
}

export async function syncShopBillingFromCheck(
  shop: string,
  check: BillingCheckResponseObject,
  isTest: boolean,
): Promise<void> {
  const subscription = check.appSubscriptions?.[0];
  const status = subscription?.status ?? null;
  const tier =
    check.hasActivePayment && subscription?.name
      ? resolvePlanTier(subscription.name)
      : null;

  await upsertShopBilling({
    shop,
    hasActivePayment: check.hasActivePayment,
    subscriptionId: subscription?.id ?? null,
    subscriptionName: subscription?.name ?? null,
    subscriptionStatus: status,
    planTier: tier,
    currentPeriodEnd: parsePeriodEnd(subscription?.currentPeriodEnd),
    trialDays: subscription?.trialDays ?? null,
    isTest,
    lastPaymentIssue: check.hasActivePayment
      ? null
      : paymentIssueForStatus(status),
    lastSyncedAt: new Date(),
  });
}

export async function syncShopBillingFromWebhook(
  shop: string,
  payload: { app_subscription?: WebhookAppSubscription },
): Promise<void> {
  const subscription = payload?.app_subscription;
  if (!subscription) return;

  const status = subscription.status ?? null;
  const blockingStatus =
    status === "FROZEN" ||
    status === "DECLINED" ||
    status === "EXPIRED" ||
    status === "PENDING";
  const hasActivePayment = status === "ACTIVE" ? true : blockingStatus ? false : false;
  const tier = subscription.name ? resolvePlanTier(subscription.name) : null;

  await upsertShopBilling({
    shop,
    hasActivePayment,
    subscriptionId: gqlIdToNumericId(subscription.admin_graphql_api_id),
    subscriptionName: subscription.name ?? null,
    subscriptionStatus: status,
    planTier: hasActivePayment ? tier : null,
    lastPaymentIssue: hasActivePayment
      ? null
      : paymentIssueForStatus(status),
    lastWebhookAt: new Date(),
    lastSyncedAt: new Date(),
  });
}

export async function deleteShopBillingRecord(shop: string): Promise<void> {
  try {
    await db.shopBilling.deleteMany({ where: { shop } });
  } catch (error) {
    console.error("deleteShopBillingRecord failed:", error);
  }
}
