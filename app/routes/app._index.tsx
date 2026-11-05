import { useEffect } from "react";
import type { HeadersFunction } from "react-router";
import { useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppNavigate } from "../hooks/useAppNavigate";
import DashboardBody from "../components/DashboardBody";
import type { DashboardApiResponse } from "../lib/dashboard-data.server";

/** No route loader — page heading paints after layout only; data loads via fetcher. */
export default function Dashboard() {
  const appNavigate = useAppNavigate();
  const fetcher = useFetcher<DashboardApiResponse>();

  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      void fetcher.load("/api/dashboard");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <s-page heading="Dashboard">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => appNavigate("/app/funnel/new")}
      >
        Create
      </s-button>

      <s-section heading="Quick actions">
        <s-stack direction="inline" gap="base">
          <s-button onClick={() => appNavigate("/app/funnel/new")}>
            Create
          </s-button>
          <s-button onClick={() => appNavigate("/app/funnel")} variant="secondary">
            View all funnels
          </s-button>
          <s-button onClick={() => appNavigate("/app/billing")} variant="tertiary">
            Billing & plans
          </s-button>
        </s-stack>
      </s-section>

      <DashboardBody data={fetcher.data} />

      <s-section slot="aside" heading="Getting started">
        <s-stack direction="block" gap="base">
          <s-paragraph tone="neutral" color="subdued">
            Create a post-purchase test, set your traffic split, and measure
            which experience converts best after checkout.
          </s-paragraph>
          <s-unordered-list>
            <s-list-item>Product offer — simple upsell after purchase</s-list-item>
            <s-list-item>Subscription Product Offer — trial funnel with subscription</s-list-item>
            <s-list-item>Quiz & Survey Product Offers — interactive post-purchase flows</s-list-item>
          </s-unordered-list>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  const headers = boundary.headers(headersArgs);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return headers;
};
