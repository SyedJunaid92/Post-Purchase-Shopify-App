import { isRouteErrorResponse, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

function isShopifyErrorResponse(error: unknown): boolean {
  if (isRouteErrorResponse(error)) return true;
  if (error && typeof error === "object") {
    const name = (error as { constructor?: { name?: string } }).constructor
      ?.name;
    return name === "ErrorResponse" || name === "ErrorResponseImpl";
  }
  return false;
}

export function AppRouteError() {
  const error = useRouteError();

  if (isShopifyErrorResponse(error)) {
    return boundary.error(error);
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "An unexpected error occurred.";

  return (
    <div style={{ padding: 24, fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 12, fontSize: 20 }}>Something went wrong</h1>
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
      <p style={{ color: "#616161", marginBottom: 16 }}>
        Try refreshing the page. If this continues, open the app from Shopify
        Admin → Apps.
      </p>
      <a href="/app" style={{ color: "#2c6ecb", fontWeight: 500 }}>
        Return to dashboard
      </a>
    </div>
  );
}
