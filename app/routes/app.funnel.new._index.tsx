import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { FunnelTypePicker } from "../components/FunnelTypePicker";
import { useAppLayoutData } from "../hooks/useAppLayoutData";
import { useAppNavigate } from "../hooks/useAppNavigate";
import type { TestType } from "../lib/tests.types";

export default function NewFunnelPicker() {
  const appData = useAppLayoutData();
  const appNavigate = useAppNavigate();
  const allowedTestTypes = (appData?.allowedTestTypes ?? [
    "product_offer",
  ]) as TestType[];

  return (
    <s-page heading="Create Post-Purchase Funnel">
      <s-link slot="breadcrumb-actions" onClick={() => appNavigate("/app/funnel")}>
        Post-Purchase Funnel
      </s-link>

      <FunnelTypePicker allowedTestTypes={allowedTestTypes} />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
