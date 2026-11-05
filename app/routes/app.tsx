import type { HeadersFunction, LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import "../styles/loading.css";

import { requirePaidPlan } from "../lib/billing.server";
import { isSupabaseConfigured } from "../lib/supabase.server";
import { AppRouteError } from "../components/AppRouteError";
import { NavigationLoading } from "../components/NavigationLoading";
import { AppNavMenu } from "../components/AppNavMenu";
import { WebVitalsReporter } from "../components/WebVitalsReporter";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const billingState = await requirePaidPlan(request);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    ...billingState,
    dbReady: isSupabaseConfigured(),
  };
};

function normalizeAppPath(pathname: string): string {
  return pathname.replace(/\/$/, "") || "/";
}

const LAYOUT_REVALIDATE_PATHS = new Set<string>();

/** Revalidate layout data only when dashboard or funnel list is opened. */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formMethod && formMethod !== "GET") return true;
  if (
    nextUrl.searchParams.has("subscribed") ||
    nextUrl.searchParams.has("cancelled")
  ) {
    return true;
  }

  const nextPath = normalizeAppPath(nextUrl.pathname);
  if (LAYOUT_REVALIDATE_PATHS.has(nextPath)) return true;

  if (
    currentUrl.pathname.startsWith("/app") &&
    nextUrl.pathname.startsWith("/app")
  ) {
    return false;
  }
  return defaultShouldRevalidate;
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isNavigating = navigation.state === "loading";

  return (
    <AppProvider embedded apiKey={apiKey}>
      <WebVitalsReporter />
      <AppNavMenu />
      <NavigationLoading />
      <div
        style={{
          opacity: isNavigating ? 0.97 : 1,
          transition: "opacity 200ms ease",
        }}
      >
        <Outlet />
      </div>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return <AppRouteError />;
}

export const headers: HeadersFunction = (headersArgs) => {
  const headers = boundary.headers(headersArgs);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return headers;
};
