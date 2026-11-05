import { useCallback, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { ProductFields } from "../lib/test-config.types";
import { normalizeProductFields } from "../lib/test-config.types";
import type { SellingPlanOption } from "../routes/app.product-selling-plans";

export type SelectedProduct = {
  id: string;
  title: string;
  imageUrl: string;
  variantId: string;
  variantLegacyId: string;
  price: string;
  sellingPlanId?: string | null;
  sellingPlanLegacyId?: string | null;
  sellingPlanName?: string | null;
  initialShippingPrice?: number;
  recurringShippingPrice?: number;
};

export function productFromSelection(
  selection: SelectedProduct | null,
  existing?: Partial<ProductFields>,
): ProductFields {
  if (!selection) {
    return normalizeProductFields(existing);
  }
  return normalizeProductFields({
    ...existing,
    productId: selection.id,
    productTitle: selection.title,
    productImageUrl: selection.imageUrl,
    variantId: selection.variantId,
    variantLegacyId: selection.variantLegacyId,
    productPrice: selection.price,
    sellingPlanId: selection.sellingPlanId ?? null,
    sellingPlanLegacyId: selection.sellingPlanLegacyId ?? null,
    sellingPlanName: selection.sellingPlanName ?? null,
    initialShippingPrice: selection.initialShippingPrice ?? 0,
    recurringShippingPrice: selection.recurringShippingPrice ?? 0,
  });
}

export function selectionFromProduct(
  product: ProductFields,
): SelectedProduct | null {
  if (!product.productId) return null;
  return {
    id: product.productId,
    title: product.productTitle ?? "",
    imageUrl: product.productImageUrl ?? "",
    variantId: product.variantId ?? "",
    variantLegacyId: product.variantLegacyId ?? "",
    price: product.productPrice ?? "0.00",
    sellingPlanId: product.sellingPlanId,
    sellingPlanLegacyId: product.sellingPlanLegacyId,
    sellingPlanName: product.sellingPlanName,
    initialShippingPrice: product.initialShippingPrice,
    recurringShippingPrice: product.recurringShippingPrice,
  };
}

type ProductPickerProps = {
  label: string;
  product: SelectedProduct | null;
  onChange: (product: SelectedProduct | null) => void;
  /** When true, only products with selling plans can be confirmed */
  subscriptionOnly?: boolean;
  /** When true, optionally attach a selling plan after product selection */
  allowSubscription?: boolean;
};

export function ProductPickerField({
  label,
  product,
  onChange,
  subscriptionOnly = false,
  allowSubscription = false,
}: ProductPickerProps) {
  const shopify = useAppBridge();
  const plansFetcher = useFetcher<{ plans: SellingPlanOption[] }>();
  const [pendingProduct, setPendingProduct] = useState<SelectedProduct | null>(
    null,
  );
  const [selectedPlanId, setSelectedPlanId] = useState("");

  const plans = plansFetcher.data?.plans ?? [];

  useEffect(() => {
    if (!pendingProduct || plansFetcher.state !== "idle") return;
    if (plansFetcher.data === undefined) return;

    if (subscriptionOnly) {
      if (!plans.length) {
        shopify.toast.show(
          "This product has no subscription plans. Pick a subscription product.",
          { isError: true },
        );
        setPendingProduct(null);
        return;
      }

      if (plans.length === 1) {
        const plan = plans[0];
        onChange({
          ...pendingProduct,
          sellingPlanId: plan.id,
          sellingPlanLegacyId: plan.legacyId,
          sellingPlanName: plan.name,
        });
        setPendingProduct(null);
        setSelectedPlanId("");
      }
      return;
    }

    if (allowSubscription) {
      if (!plans.length) {
        onChange(pendingProduct);
        setPendingProduct(null);
        setSelectedPlanId("");
        return;
      }

      if (plans.length === 1) {
        setSelectedPlanId(plans[0].id);
      }
    }
  }, [
    pendingProduct,
    plans,
    plansFetcher.data,
    plansFetcher.state,
    onChange,
    shopify,
    subscriptionOnly,
    allowSubscription,
  ]);

  const pickProduct = useCallback(async () => {
    const selection = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: false,
      filter: { variants: true },
    });

    if (!selection?.length) return;
    const item = selection[0];
    const variant = item.variants?.[0];
    if (!variant?.id) {
      shopify.toast.show("Select a product with at least one variant", {
        isError: true,
      });
      return;
    }

    const base: SelectedProduct = {
      id: item.id,
      title: item.title ?? "Product",
      imageUrl: item.images?.[0]?.originalSrc ?? "",
      variantId: variant.id,
      variantLegacyId: variant.id.split("/").pop() ?? "",
      price: variant.price ?? "0.00",
      sellingPlanId: null,
      sellingPlanLegacyId: null,
      sellingPlanName: null,
      initialShippingPrice: 0,
      recurringShippingPrice: 0,
    };

    if (subscriptionOnly) {
      setPendingProduct(base);
      setSelectedPlanId("");
      plansFetcher.load(
        `/app/product-selling-plans?productId=${encodeURIComponent(item.id)}`,
      );
      return;
    }

    if (allowSubscription) {
      setPendingProduct(base);
      setSelectedPlanId("__onetime__");
      plansFetcher.load(
        `/app/product-selling-plans?productId=${encodeURIComponent(item.id)}`,
      );
      return;
    }

    onChange(base);
  }, [onChange, plansFetcher, shopify, subscriptionOnly, allowSubscription]);

  const confirmPlan = () => {
    if (!pendingProduct) return;

    if (allowSubscription && selectedPlanId === "__onetime__") {
      onChange(pendingProduct);
      setPendingProduct(null);
      setSelectedPlanId("");
      return;
    }

    if (!selectedPlanId) return;
    const plan = plans.find((p) => p.id === selectedPlanId);
    if (!plan) return;

    onChange({
      ...pendingProduct,
      sellingPlanId: plan.id,
      sellingPlanLegacyId: plan.legacyId,
      sellingPlanName: plan.name,
    });
    setPendingProduct(null);
    setSelectedPlanId("");
  };

  const showPlanPicker =
    Boolean(pendingProduct) &&
    plansFetcher.state === "idle" &&
    plans.length > 0 &&
    (subscriptionOnly ? plans.length > 1 : allowSubscription);

  return (
    <s-stack direction="block" gap="base">
      <s-text type="strong">{label}</s-text>
      {subscriptionOnly ? (
        <s-text tone="neutral" color="subdued">
          Only products with subscription selling plans can be selected.
          Subscription post-purchase offers require the customer&apos;s order to
          include a shipping address (not digital-only or local pickup).
        </s-text>
      ) : null}

      {showPlanPicker ? (
        <s-box padding="base" border="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="base">
            <s-text type="strong">Select subscription plan</s-text>
            <s-text>{pendingProduct?.title}</s-text>
            <s-select
              label="Selling plan"
              value={selectedPlanId}
              onChange={(e: Event) =>
                setSelectedPlanId((e.currentTarget as HTMLSelectElement).value)
              }
            >
              {allowSubscription ? (
                <s-option value="__onetime__">One-time purchase</s-option>
              ) : (
                <s-option value="">Choose a plan…</s-option>
              )}
              {plans.map((plan) => (
                <s-option key={plan.id} value={plan.id}>
                  {plan.groupName} — {plan.name}
                </s-option>
              ))}
            </s-select>
            <s-stack direction="inline" gap="base">
              <s-button
                variant="primary"
                onClick={confirmPlan}
                disabled={!selectedPlanId && subscriptionOnly}
              >
                Confirm plan
              </s-button>
              <s-button
                variant="tertiary"
                onClick={() => {
                  setPendingProduct(null);
                  setSelectedPlanId("");
                }}
              >
                Cancel
              </s-button>
            </s-stack>
          </s-stack>
        </s-box>
      ) : null}

      {pendingProduct && plansFetcher.state !== "idle" ? (
        <s-text tone="neutral" color="subdued">
          Loading subscription plans…
        </s-text>
      ) : null}

      {product ? (
        <s-box padding="base" border="base" borderRadius="base">
          <s-stack direction="inline" gap="base" alignItems="center">
            {product.imageUrl ? (
              <s-thumbnail
                src={product.imageUrl}
                alt={product.title}
                size="small"
              />
            ) : null}
            <s-stack direction="block" gap="none">
              <s-text type="strong">{product.title}</s-text>
              <s-text tone="neutral" color="subdued">
                ${product.price}
                {product.sellingPlanName
                  ? ` · ${product.sellingPlanName}`
                  : ""}
              </s-text>
            </s-stack>
            <s-button variant="tertiary" onClick={pickProduct}>
              Change
            </s-button>
          </s-stack>
        </s-box>
      ) : !showPlanPicker && !pendingProduct ? (
        <s-button onClick={pickProduct}>Select product</s-button>
      ) : null}
    </s-stack>
  );
}
