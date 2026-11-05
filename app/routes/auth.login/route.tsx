import { AppProvider } from "@shopify/shopify-app-react-router/react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    await login(request);
  }

  return {
    embedded: url.searchParams.get("embedded") === "1",
    supportEmail:
      process.env.APP_SUPPORT_EMAIL?.trim() || "appifylabs3@gmail.com",
  };
};

export default function Auth() {
  const { embedded, supportEmail } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded={false}>
      <s-page heading="Open from Shopify Admin">
        {embedded ? (
          <s-banner tone="info">
            Your Shopify session expired. Re-open Post-Purchase App from
            Shopify Admin → Apps.
          </s-banner>
        ) : (
          <s-banner tone="info">
            Install or open this app from the Shopify App Store or Shopify
            Admin. Manual shop-domain login is not supported.
          </s-banner>
        )}
        <s-section>
          <s-paragraph>
            To use Post-Purchase App, install it from the Shopify App Store,
            then open it from Apps in your Shopify admin.
          </s-paragraph>
          <s-paragraph>
            Support:{" "}
            <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          </s-paragraph>
        </s-section>
      </s-page>
    </AppProvider>
  );
}
