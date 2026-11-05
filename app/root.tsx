import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError, isRouteErrorResponse } from "react-router";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" crossOrigin="anonymous" />
        {/*
          Polaris web components (s-page, s-button, …) and App Bridge are loaded
          from Shopify's CDN. The LCP element (the s-page heading) can't render
          until polaris.js downloads and upgrades the custom element, so we
          preload both scripts here — the browser starts fetching them as soon
          as the HTML head arrives instead of discovering them late in the body.
        */}
        <link
          rel="preload"
          href="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          as="script"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="https://cdn.shopify.com/shopifycloud/polaris.js"
          as="script"
          crossOrigin="anonymous"
          {...{ fetchpriority: "high" }}
        />
        <link rel="preload" href="/app-logo.png" as="image" type="image/png" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let title = "Application Error";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message =
      typeof error.data === "string"
        ? error.data
        : error.data?.message ?? message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{title}</title>
      </head>
      <body style={{ fontFamily: "Inter, system-ui, sans-serif", padding: 24 }}>
        <h1 style={{ marginBottom: 12 }}>{title}</h1>
        <p style={{ color: "#616161", marginBottom: 16 }}>{message}</p>
        {error instanceof Error && error.stack ? (
          <pre
            style={{
              padding: 16,
              background: "#f6f6f7",
              borderRadius: 8,
              overflow: "auto",
              fontSize: 12,
              marginBottom: 16,
              whiteSpace: "pre-wrap",
            }}
          >
            {error.stack}
          </pre>
        ) : null}
        <p style={{ color: "#616161" }}>
          Try refreshing the page. If this continues, open the app from Shopify
          Admin → Apps and reinstall if needed.
        </p>
      </body>
    </html>
  );
}
