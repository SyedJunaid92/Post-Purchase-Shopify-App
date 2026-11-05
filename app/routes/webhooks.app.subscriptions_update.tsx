import type { ActionFunctionArgs } from "react-router";
import { acceptShopifyWebhook } from "../lib/webhooks.server";

export const maxDuration = 60;

export const action = ({ request }: ActionFunctionArgs) =>
  acceptShopifyWebhook(request, {
    logLabel: "Subscription update webhook",
    tolerateDedupErrors: true,
    rerunOnDuplicate: true,
    handler: async ({ shop, topic, payload }) => {
      console.log(`Received ${topic} webhook for ${shop}`);
      const { handleSubscriptionBillingWebhook } =
        await import("../lib/billing-sync.server");
      await handleSubscriptionBillingWebhook(
        shop,
        payload as { app_subscription?: { status?: string; name?: string } },
      );
    },
  });
