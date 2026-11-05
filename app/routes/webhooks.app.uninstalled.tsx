import type { ActionFunctionArgs } from "react-router";
import { redactShopData } from "../lib/compliance.server";
import { acceptShopifyWebhook } from "../lib/webhooks.server";

export const maxDuration = 60;

export const action = ({ request }: ActionFunctionArgs) =>
  acceptShopifyWebhook(request, {
    logLabel: "Uninstall webhook",
    tolerateDedupErrors: true,
    // Shopify retries the same webhook ID after timeouts — cleanup must still run.
    rerunOnDuplicate: true,
    handler: async ({ shop, topic }) => {
      console.log(`Received ${topic} webhook for ${shop}`);
      await redactShopData(shop);
    },
  });
