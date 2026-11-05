import type { PostPurchaseAppStatus } from "../lib/post-purchase-setup.server";

type Props = {
  checkoutSettingsUrl: string;
  status: PostPurchaseAppStatus;
  /** Partner dev / test-billing stores often get false negatives from Shopify */
  billingTest?: boolean;
};

export function PostPurchaseSetupBanner({
  checkoutSettingsUrl,
  status,
  billingTest = false,
}: Props) {
  if (status.state === "active") return null;
  if (
    status.state === "unknown" &&
    (billingTest || status.isDevStore)
  ) {
    return null;
  }

  function openCheckoutSettings() {
    window.open(checkoutSettingsUrl, "_top");
  }

  if (status.state === "unknown") {
    return (
      <s-banner tone="info" heading="Could not verify post-purchase status">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Shopify did not confirm whether this app is the active post-purchase
            app. If you already enabled it under Settings → Checkout →
            Post-purchase page, you can ignore this and run a test checkout.
          </s-paragraph>
          <s-button onClick={openCheckoutSettings}>
            Open checkout settings
          </s-button>
        </s-stack>
      </s-banner>
    );
  }

  return (
    <s-banner tone="warning" heading="Post-purchase page not active">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Your funnel is configured, but Shopify will skip the offer until this
          app is selected as the active post-purchase app in checkout settings.
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>
            Go to Settings → Checkout → Post-purchase page
          </s-list-item>
          <s-list-item>Enable the post-purchase page</s-list-item>
          <s-list-item>
            Select &quot;Post-Purchase App&quot; as the active app
          </s-list-item>
          <s-list-item>
            Complete a new test checkout (not an old order)
          </s-list-item>
        </s-unordered-list>
        <s-button onClick={openCheckoutSettings}>
          Open checkout settings
        </s-button>
      </s-stack>
    </s-banner>
  );
}
