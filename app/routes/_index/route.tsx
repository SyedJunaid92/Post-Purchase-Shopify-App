import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, Link } from "react-router";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Embedded loads from Admin arrive here with a `shop` param. Send them into
  // the embedded app, which authenticates via token exchange. Redirecting to
  // OAuth/login here would navigate the iframe to admin.shopify.com and be
  // blocked ("refused to connect").
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return {
    supportEmail:
      process.env.APP_SUPPORT_EMAIL?.trim() || "appifylabs3@gmail.com",
  };
};

export default function MarketingHome() {
  const { supportEmail } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <p className={styles.eyebrow}>Shopify post-purchase upsells</p>
        <h1 className={styles.heading}>Post-Purchase App</h1>
        <p className={styles.text}>
          Turn completed checkouts into revenue with product offers, quizzes,
          surveys, subscription trials, and combo split tests — all on Shopify’s
          post-purchase page.
        </p>

        <div className={styles.installNotice}>
          <strong>Install from Shopify</strong>
          <p>
            Install Post-Purchase App from the Shopify App Store, then open it
            from <strong>Shopify Admin → Apps</strong>. This app does not
            support manual shop-domain login.
          </p>
        </div>

        <ul className={styles.list}>
          <li>
            <strong>Post-purchase funnels</strong>
            <span>
              Run product offers, quizzes, surveys, and subscription trials after
              payment.
            </span>
          </li>
          <li>
            <strong>Split testing</strong>
            <span>
              Compare flows with traffic splits and conversion analytics.
            </span>
          </li>
          <li>
            <strong>Built for Shopify</strong>
            <span>
              Embedded admin, secure billing, and checkout post-purchase
              extension.
            </span>
          </li>
        </ul>

        <p className={styles.footer}>
          <Link to="/privacy">Privacy policy</Link>
          <span aria-hidden="true"> · </span>
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
        </p>
      </div>
    </div>
  );
}
