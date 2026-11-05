import type { BillingCheckResponseObject } from "@shopify/shopify-api";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { unauthenticated } from "../shopify.server";
import db from "../db.server";
import { ALL_BILLING_PLAN_NAMES, type BillingPlanName } from "./billing.plans";
import { resolveBillingIsTest } from "./billing.server";
import {
  getShopBillingRecord,
  paymentIssueForStatus,
  syncShopBillingFromCheck,
  syncShopBillingFromWebhook,
} from "./billing-records.server";

type GraphqlAppSubscription = {
  id: string;
  name: string;
  status: string;
  trialDays: number;
  currentPeriodEnd: string | null;
  test: boolean;
};

const BLOCKING_WEBHOOK_STATUSES = new Set([
  "FROZEN",
  "DECLINED",
  "EXPIRED",
  "PENDING",
]);

function subscriptionIdFromGid(id: string): string {
  const match = id.match(/\/(\d+)\s*$/);
  return match?.[1] ?? id;
}

function mapGraphqlSubscription(
  subscription: GraphqlAppSubscription,
): NonNullable<BillingCheckResponseObject["appSubscriptions"]>[number] {
  return {
    id: subscriptionIdFromGid(subscription.id),
    name: subscription.name,
    status: subscription.status as NonNullable<
      BillingCheckResponseObject["appSubscriptions"]
    >[number]["status"],
    trialDays: subscription.trialDays,
    currentPeriodEnd: subscription.currentPeriodEnd ?? "",
    test: subscription.test,
    lineItems: [],
    returnUrl: "",
    createdAt: "",
  };
}

async function fetchBillingCheckFromAdmin(
  admin: AdminApiContext,
  isTest: boolean,
): Promise<BillingCheckResponseObject> {
  const response = await admin.graphql(`#graphql
    query AppBillingSubscriptions {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          trialDays
          currentPeriodEnd
          test
        }
      }
    }
  `);
  const json = await response.json();
  const subscriptions: GraphqlAppSubscription[] =
    json?.data?.currentAppInstallation?.activeSubscriptions ?? [];

  const matchingPlans = subscriptions.filter(
    (subscription) =>
      ALL_BILLING_PLAN_NAMES.includes(subscription.name as BillingPlanName) &&
      subscription.test === isTest,
  );
  const activePlans = matchingPlans.filter(
    (subscription) => subscription.status === "ACTIVE",
  );

  return {
    hasActivePayment: activePlans.length > 0,
    appSubscriptions: activePlans.map(mapGraphqlSubscription),
    oneTimePurchases: [],
  };
}

function trialEndedPaymentIssue(
  previousTrialDays: number | null | undefined,
  status: string | null | undefined,
): string | null {
  if (!previousTrialDays || previousTrialDays <= 0) return null;
  if (status === "FROZEN") {
    return "Your trial has ended and the first payment failed. Update your payment method in Shopify Billing to restore access.";
  }
  if (status === "DECLINED" || status === "EXPIRED") {
    return "Your trial has ended but the subscription could not be activated. Choose a plan below to subscribe again.";
  }
  return null;
}

/**
 * Backfills or refreshes billing state for an already-installed shop using its
 * offline session. Used after auth, webhooks, and for merchants who installed
 * before subscription webhooks were registered.
 */
export async function syncShopBillingForInstalledShop(
  shop: string,
): Promise<boolean> {
  try {
    const { admin } = await unauthenticated.admin(shop);
    const isTest = await resolveBillingIsTest(admin);
    const check = await fetchBillingCheckFromAdmin(admin, isTest);
    await syncShopBillingFromCheck(shop, check, isTest);
    return true;
  } catch (error) {
    console.warn(`syncShopBillingForInstalledShop skipped for ${shop}`, error);
    return false;
  }
}

/**
 * Applies a subscription webhook, reconciles with Admin API when possible,
 * and enforces blocking statuses (trial ended + payment failed, etc.).
 */
export async function handleSubscriptionBillingWebhook(
  shop: string,
  payload: { app_subscription?: { status?: string; name?: string } },
): Promise<void> {
  const webhookStatus = payload?.app_subscription?.status ?? null;
  const previousRecord = await getShopBillingRecord(shop);

  await syncShopBillingFromWebhook(shop, payload);
  await syncShopBillingForInstalledShop(shop);

  if (!webhookStatus || !BLOCKING_WEBHOOK_STATUSES.has(webhookStatus)) {
    return;
  }

  const trialIssue = trialEndedPaymentIssue(
    previousRecord?.trialDays,
    webhookStatus,
  );

  try {
    await db.shopBilling.update({
      where: { shop },
      data: {
        subscriptionStatus: webhookStatus,
        hasActivePayment: false,
        lastPaymentIssue:
          trialIssue ?? paymentIssueForStatus(webhookStatus),
        lastWebhookAt: new Date(),
      },
    });
  } catch (error) {
    console.error("handleSubscriptionBillingWebhook blocking update failed:", error);
  }
}
