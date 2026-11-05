import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, Link } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy | Post-Purchase App" },
  {
    name: "description",
    content:
      "Privacy policy for Post-Purchase App, a Shopify post-purchase upsell application by Appify Labs.",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const supportEmail =
    process.env.APP_SUPPORT_EMAIL?.trim() || "appifylabs3@gmail.com";
  const appUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;

  return { supportEmail, appUrl };
};

export default function PrivacyPolicy() {
  const { supportEmail, appUrl } = useLoaderData<typeof loader>();

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 24px",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#202223",
        lineHeight: 1.6,
      }}
    >
      <p style={{ marginBottom: 8 }}>
        <Link to="/" style={{ color: "#008060", textDecoration: "none" }}>
          ← Post-Purchase App
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Privacy Policy</h1>
      <p style={{ color: "#616161" }}>Last updated: June 18, 2026</p>

      <p>
        Post-Purchase App (&quot;we&quot;, &quot;our&quot;, or &quot;the
        app&quot;) is a Shopify application operated by Appify Labs. This policy
        explains what information we collect when merchants install and use the
        app, and how we use it.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Shop and account data:</strong> store domain, staff account
          details provided by Shopify during installation, and OAuth session
          tokens required to operate the app.
        </li>
        <li>
          <strong>App configuration:</strong> post-purchase funnel settings,
          test definitions, product selections, and billing subscription status.
        </li>
        <li>
          <strong>Analytics events:</strong> anonymized funnel events such as
          offer views, accepts, declines, and step completions tied to checkout
          reference IDs — not end-customer personal profiles.
        </li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>Provide and secure the post-purchase funnel experience.</li>
        <li>Display analytics and performance metrics to merchants.</li>
        <li>Process subscription billing through Shopify Billing.</li>
        <li>Respond to support requests and maintain the service.</li>
      </ul>

      <h2>Data sharing</h2>
      <p>
        We do not sell merchant or customer data. Information is shared only
        with service providers required to run the app (for example hosting and
        database providers) and with Shopify as part of normal app operation.
      </p>

      <h2>Data retention</h2>
      <p>
        Merchant configuration and analytics are retained while the app is
        installed. When the app is uninstalled, associated shop data is deleted
        in line with our uninstall webhook handling.
      </p>

      <h2>Security</h2>
      <p>
        We use industry-standard measures including encrypted connections
        (HTTPS), authenticated Shopify sessions, HMAC-verified webhooks, and
        access controls on production infrastructure.
      </p>

      <h2>Your rights</h2>
      <p>
        Merchants may request access, correction, or deletion of their data by
        contacting us. You may also uninstall the app at any time from your
        Shopify admin.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy:{" "}
        <a href={`mailto:${supportEmail}`} style={{ color: "#008060" }}>
          {supportEmail}
        </a>
      </p>
    </main>
  );
}
