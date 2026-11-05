import type { ActionFunctionArgs } from "react-router";
import { redactCustomerData, redactShopData } from "../lib/compliance.server";
import { acceptShopifyWebhook } from "../lib/webhooks.server";
import { isComplianceTopic } from "../lib/webhook-request.server";

type CompliancePayload = {
  shop_domain?: string;
  orders_to_redact?: number[];
  orders_requested?: number[];
  customer?: { id?: number; email?: string; phone?: string };
};

export const maxDuration = 60;

export const action = ({ request }: ActionFunctionArgs) =>
  acceptShopifyWebhook(request, {
    logLabel: "Compliance webhook",
    tolerateDedupErrors: true,
    rerunOnDuplicate: true,
    handler: async ({ shop, topic, payload }) => {
      const body = payload as CompliancePayload;
      console.log(`Received compliance webhook ${topic} for ${shop}`);

      if (isComplianceTopic(topic, "customers/data_request")) {
        // We store checkout reference IDs only — no customer PII to export.
        return;
      }

      if (isComplianceTopic(topic, "customers/redact")) {
        await redactCustomerData(shop, body.orders_to_redact ?? []);
        return;
      }

      if (isComplianceTopic(topic, "shop/redact")) {
        await redactShopData(body.shop_domain ?? shop);
        return;
      }

      console.warn(`Unhandled compliance topic: ${topic}`);
    },
  });
