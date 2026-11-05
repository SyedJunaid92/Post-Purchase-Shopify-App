import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  resolveBillingIsTest,
  resolveBillingReturnUrl,
} from "../lib/billing.server";
import { syncShopBillingFromCheck } from "../lib/billing-records.server";
import { useAppLayoutData } from "../hooks/useAppLayoutData";
import {
  ALL_BILLING_PLAN_NAMES,
  annualPrice,
  planNameForTier,
  PLAN_MARKETING,
  PLAN_TIER_LABELS,
  type BillingPlanName,
  type PlanTier,
} from "../lib/billing.plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  return {
    justSubscribed: url.searchParams.get("subscribed") === "1",
    justCancelled: url.searchParams.get("cancelled") === "1",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session, admin, redirect } =
    await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "subscribe");
  const isTest = await resolveBillingIsTest(admin);

  if (intent === "cancel") {
    const check = await billing.check({
      plans: ALL_BILLING_PLAN_NAMES,
      isTest,
    });
    const subscription = check.appSubscriptions?.[0];
    if (!subscription?.id) {
      return { error: "No active subscription to cancel." };
    }

    await billing.cancel({
      subscriptionId: subscription.id,
      isTest,
      prorate: true,
    });

    const afterCancel = await billing.check({
      plans: ALL_BILLING_PLAN_NAMES,
      isTest,
    });
    await syncShopBillingFromCheck(session.shop, afterCancel, isTest);

    throw redirect("/app/billing?cancelled=1");
  }

  const plan = String(form.get("plan") ?? "");

  if (!ALL_BILLING_PLAN_NAMES.includes(plan as BillingPlanName)) {
    return { error: "Select a valid plan to continue." };
  }

  return billing.request({
    plan: plan as BillingPlanName,
    isTest,
    returnUrl: await resolveBillingReturnUrl(admin, session.shop),
  });
};

const TIERS: PlanTier[] = ["starter", "growth", "scale"];
const CANCEL_MODAL_ID = "cancel-subscription-modal";

export default function Billing() {
  const appData = useAppLayoutData();
  const { justSubscribed, justCancelled } = useLoaderData<typeof loader>();
  const tier = appData?.tier ?? null;
  const hasActivePayment = appData?.hasActivePayment ?? false;
  const activeSubscription = appData?.activeSubscription ?? null;
  const billingRecord = appData?.billingRecord ?? null;
  const billingTest = appData?.billingTest ?? false;
  const fetcher = useFetcher<typeof action>();
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const busy = fetcher.state !== "idle";
  const submittingIntent = fetcher.formData?.get("intent");
  const submittingPlan = fetcher.formData?.get("plan");
  const isCancelling = busy && submittingIntent === "cancel";

  const confirmCancel = () => {
    const formData = new FormData();
    formData.set("intent", "cancel");
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <s-page heading="Billing & plans">
      {billingTest ? (
        <s-banner tone="info" heading="Development store — test billing">
          This is a partner development store. Charges are in Shopify test mode
          and no real payment is collected.
        </s-banner>
      ) : null}

      {justSubscribed ? (
        <s-banner tone="success" heading="Subscription active">
          Your plan is now active. You can use all features included in your
          plan.
        </s-banner>
      ) : null}

      {justCancelled ? (
        <s-banner tone="info" heading="Subscription cancelled">
          Your subscription has been cancelled. Choose a plan below to subscribe
          again.
        </s-banner>
      ) : null}

      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <s-banner tone="critical">{fetcher.data.error}</s-banner>
      ) : null}

      {billingRecord?.lastPaymentIssue && !hasActivePayment ? (
        <s-banner tone="critical" heading="Payment issue">
          {billingRecord.lastPaymentIssue}
          {billingRecord.subscriptionStatus === "FROZEN" ? (
            <>
              {" "}
              Open Shopify admin → Settings → Billing to update your payment
              method.
            </>
          ) : null}
        </s-banner>
      ) : null}

      {activeSubscription?.trialDays &&
      activeSubscription.trialDays > 0 &&
      hasActivePayment ? (
        <s-banner tone="info" heading="Trial period">
          Your {activeSubscription.trialDays}-day trial is active. Shopify will
          charge your plan when the trial ends unless you cancel first.
        </s-banner>
      ) : null}

      {billingRecord?.currentPeriodEnd && hasActivePayment ? (
        <s-text tone="neutral" color="subdued">
          Current billing period ends{" "}
          {new Date(billingRecord.currentPeriodEnd).toLocaleDateString()}.
        </s-text>
      ) : null}

      {hasActivePayment && tier ? (
        <s-banner tone="success" heading="Active subscription">
          You are on the {PLAN_TIER_LABELS[tier]} plan
          {activeSubscription?.name ? ` (${activeSubscription.name})` : ""}.
        </s-banner>
      ) : (
        <s-banner tone="warning" heading="Subscription required">
          Choose a plan below to use Post-Purchase Funnel. Until you subscribe,
          only this billing page is available.
        </s-banner>
      )}

      {hasActivePayment && activeSubscription?.id ? (
        <s-section heading="Manage subscription">
          <s-box
            padding="base"
            border="base"
            borderRadius="base"
            background="base"
          >
            <s-stack direction="block" gap="base">
              <s-text tone="neutral" color="subdued">
                To change plans, pick a different plan below and approve the new
                charge in Shopify. To stop using the app, cancel your
                subscription.
              </s-text>
              <s-button
                tone="critical"
                variant="tertiary"
                commandFor={CANCEL_MODAL_ID}
                command="--show"
                disabled={busy}
              >
                Cancel subscription
              </s-button>
            </s-stack>
          </s-box>
        </s-section>
      ) : null}

      <s-modal id={CANCEL_MODAL_ID} heading="Cancel subscription?">
        <s-stack direction="block" gap="base">
          <s-text>
            Are you sure you want to cancel your subscription? You will lose
            access to paid features when the current billing period ends.
          </s-text>
          <s-banner tone="warning">
            <s-text>You can subscribe again anytime from this page.</s-text>
          </s-banner>
        </s-stack>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          disabled={busy}
          {...(isCancelling ? { loading: true } : {})}
          onClick={confirmCancel}
        >
          Cancel subscription
        </s-button>
        <s-button
          slot="secondary-actions"
          commandFor={CANCEL_MODAL_ID}
          command="--hide"
          disabled={isCancelling}
        >
          Keep subscription
        </s-button>
      </s-modal>

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-button
            variant={interval === "monthly" ? "primary" : "secondary"}
            onClick={() => setInterval("monthly")}
          >
            Monthly
          </s-button>
          <s-button
            variant={interval === "annual" ? "primary" : "secondary"}
            onClick={() => setInterval("annual")}
          >
            Annual (20% off)
          </s-button>
        </s-stack>
      </s-section>

      <s-section>
        <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
          {TIERS.map((planTier) => {
            const marketing = PLAN_MARKETING[planTier];
            const isCurrent = tier === planTier;
            const planName = planNameForTier(planTier, interval);
            const isSubscribingThisPlan =
              busy &&
              submittingIntent === "subscribe" &&
              submittingPlan === planName;
            const displayPrice =
              interval === "monthly"
                ? `$${marketing.monthlyPrice}`
                : `$${annualPrice(marketing.monthlyPrice)}`;
            const period = interval === "monthly" ? "/ month" : "/ year";

            return (
              <s-box
                key={planTier}
                padding="large-400"
                border="base"
                borderRadius="base"
                background={planTier === "growth" ? "subdued" : "base"}
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="block" gap="base">
                    {/* {planTier === "scale" ? (
                      <s-badge tone="success">Most popular</s-badge>
                    ) : null} */}
                    {isCurrent ? (
                      <s-badge tone="info">Current plan</s-badge>
                    ) : null}
                    <s-heading>{marketing.name}</s-heading>
                    <s-stack
                      direction="inline"
                      gap="none"
                      alignItems="baseline"
                    >
                      <s-text type="strong">{displayPrice}</s-text>
                      <s-text tone="neutral" color="subdued">
                        {period}
                      </s-text>
                    </s-stack>
                    {interval === "annual" ? (
                      <s-text tone="neutral" color="subdued">
                        Equivalent to $
                        {Math.round(marketing.monthlyPrice * 0.8)}/month
                      </s-text>
                    ) : null}
                    <s-paragraph tone="neutral" color="subdued">
                      {marketing.description}
                    </s-paragraph>
                  </s-stack>

                  <s-divider />

                  <s-unordered-list>
                    {marketing.features.map((feature) => (
                      <s-list-item key={feature}>{feature}</s-list-item>
                    ))}
                  </s-unordered-list>

                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="subscribe" />
                    <input type="hidden" name="plan" value={planName} />
                    <s-button
                      type="submit"
                      variant={planTier === "growth" ? "primary" : "secondary"}
                      disabled={isCurrent || busy}
                      {...(isSubscribingThisPlan ? { loading: true } : {})}
                    >
                      {isCurrent
                        ? "Current plan"
                        : hasActivePayment
                          ? `Switch to ${marketing.name}`
                          : `Subscribe to ${marketing.name}`}
                    </s-button>
                  </fetcher.Form>
                </s-stack>
              </s-box>
            );
          })}
        </s-grid>
      </s-section>

      <s-section heading="Compare plans">
        <s-box
          border="base"
          borderRadius="base"
          background="base"
          padding="base"
        >
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Feature</s-table-header>
              <s-table-header>Starter</s-table-header>
              <s-table-header>Growth</s-table-header>
              <s-table-header>Scale</s-table-header>
            </s-table-header-row>
            <s-table-body>
              <CompareRow
                feature="Price (monthly)"
                starter="$25"
                growth="$50"
                scale="$100"
              />
              <CompareRow
                feature="Product offer"
                starter="✓"
                growth="✓"
                scale="✓"
              />
              <CompareRow
                feature="Subscription product offer"
                starter="—"
                growth="✓"
                scale="✓"
              />
              <CompareRow
                feature="Analytics dashboard"
                starter="Basic"
                growth="✓"
                scale="✓"
              />
              <CompareRow
                feature="Quiz product offer"
                starter="—"
                growth="—"
                scale="✓"
              />
              <CompareRow
                feature="Survey product offer"
                starter="—"
                growth="—"
                scale="✓"
              />

              <CompareRow
                feature="Combo tests"
                starter="—"
                growth="—"
                scale="✓"
              />
            </s-table-body>
          </s-table>
        </s-box>
      </s-section>
    </s-page>
  );
}

function CompareRow({
  feature,
  starter,
  growth,
  scale,
}: {
  feature: string;
  starter: string;
  growth: string;
  scale: string;
}) {
  return (
    <s-table-row>
      <s-table-cell>{feature}</s-table-cell>
      <s-table-cell>{starter}</s-table-cell>
      <s-table-cell>{growth}</s-table-cell>
      <s-table-cell>{scale}</s-table-cell>
    </s-table-row>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
