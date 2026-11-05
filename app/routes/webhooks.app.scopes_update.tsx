import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { acceptShopifyWebhook } from "../lib/webhooks.server";

export const maxDuration = 60;

export const action = ({ request }: ActionFunctionArgs) =>
  acceptShopifyWebhook(request, {
    logLabel: "Scopes update webhook",
    tolerateDedupErrors: true,
    rerunOnDuplicate: true,
    handler: async ({ shop, topic, payload }) => {
      console.log(`Received ${topic} webhook for ${shop}`);

      const current = (payload as { current?: string[] }).current;
      if (Array.isArray(current)) {
        await db.session.updateMany({
          where: { shop },
          data: { scope: current.toString() },
        });
      }
      const { syncShopBillingForInstalledShop } =
        await import("../lib/billing-sync.server");
      await syncShopBillingForInstalledShop(shop);
    },
  });
