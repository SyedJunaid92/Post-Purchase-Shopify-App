import { useAppBridge } from "@shopify/app-bridge-react";
import { useCallback } from "react";
import {
  gidLegacyId,
  type FunnelTriggers,
  type TriggerCollection,
  type TriggerProduct,
} from "../lib/funnel-triggers.types";

type Props = {
  triggers: FunnelTriggers;
  onChange: (triggers: FunnelTriggers) => void;
};

export function FunnelEditorTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: "trigger" | "details";
  onTabChange: (tab: "trigger" | "details") => void;
}) {
  return (
    <s-stack direction="inline" gap="base">
      <s-button
        variant={activeTab === "trigger" ? "secondary" : "tertiary"}
        onClick={() => onTabChange("trigger")}
      >
        Triggers
      </s-button>
      <s-button
        variant={activeTab === "details" ? "secondary" : "tertiary"}
        onClick={() => onTabChange("details")}
      >
        Details
      </s-button>
    </s-stack>
  );
}

export function FunnelTriggerEditor({ triggers, onChange }: Props) {
  const shopify = useAppBridge();

  const setEnabled = (productCollectionEnabled: boolean) => {
    onChange({
      ...triggers,
      productCollectionEnabled,
      ...(productCollectionEnabled
        ? {}
        : { products: [], collections: [] }),
    });
  };

  const pickProducts = useCallback(async () => {
    const selection = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: true,
      filter: { variants: false },
    });

    if (!selection?.length) return;

    const picked: TriggerProduct[] = selection.map((item) => ({
      id: item.id,
      legacyId: gidLegacyId(item.id),
      title: item.title ?? "Product",
      imageUrl: item.images?.[0]?.originalSrc ?? null,
    }));

    const merged = new Map(triggers.products.map((item) => [item.id, item]));
    for (const item of picked) merged.set(item.id, item);

    onChange({
      ...triggers,
      productCollectionEnabled: true,
      products: [...merged.values()],
    });
  }, [onChange, shopify, triggers]);

  const pickCollections = useCallback(async () => {
    const selection = await shopify.resourcePicker({
      type: "collection",
      action: "select",
      multiple: true,
    });

    if (!selection?.length) return;

    const picked: TriggerCollection[] = selection.map((item) => {
      const row = item as {
        id: string;
        title?: string;
        image?: { originalSrc?: string } | string | null;
      };
      const imageUrl =
        typeof row.image === "string"
          ? row.image
          : (row.image?.originalSrc ?? null);

      return {
        id: row.id,
        title: row.title ?? "Collection",
        imageUrl,
        productLegacyIds: [],
      };
    });

    const merged = new Map(triggers.collections.map((item) => [item.id, item]));
    for (const item of picked) merged.set(item.id, item);

    onChange({
      ...triggers,
      productCollectionEnabled: true,
      collections: [...merged.values()],
    });
  }, [onChange, shopify, triggers]);

  const removeProduct = (id: string) => {
    onChange({
      ...triggers,
      products: triggers.products.filter((item) => item.id !== id),
    });
  };

  const removeCollection = (id: string) => {
    onChange({
      ...triggers,
      collections: triggers.collections.filter((item) => item.id !== id),
    });
  };

  const selectionCount =
    triggers.products.length + triggers.collections.length;

  return (
    <s-stack direction="block" gap="base">
      <s-text tone="neutral" color="subdued">
        Control when this funnel appears after checkout. Traffic percentage
        still applies after a trigger matches.
      </s-text>

      <s-section heading="Product based triggers">
        <s-box padding="base" border="base" borderRadius="base" background="base">
          <s-stack direction="block" gap="base">
            <s-stack
              direction="inline"
              gap="base"
              alignItems="start"
              justifyContent="space-between"
            >
              <s-stack direction="block" gap="small">
                <s-checkbox
                  label="Product / Collection"
                  checked={triggers.productCollectionEnabled}
                  onChange={() =>
                    setEnabled(!triggers.productCollectionEnabled)
                  }
                />
                <s-text tone="neutral" color="subdued">
                  Show this funnel when the order includes any of the selected
                  products or collection products.
                </s-text>
              </s-stack>
              {triggers.productCollectionEnabled ? (
                <s-stack direction="inline" gap="small">
                  <s-button variant="secondary" onClick={pickProducts}>
                    Select products
                  </s-button>
                  <s-button variant="secondary" onClick={pickCollections}>
                    Select collections
                  </s-button>
                </s-stack>
              ) : null}
            </s-stack>

            {triggers.productCollectionEnabled ? (
              <s-stack direction="block" gap="base">
                {selectionCount > 0 ? (
                  <s-text tone="neutral" color="subdued">
                    {selectionCount} item{selectionCount === 1 ? "" : "s"}{" "}
                    selected
                  </s-text>
                ) : (
                  <s-banner tone="warning">
                    Select at least one product or collection for this trigger.
                  </s-banner>
                )}

                {triggers.products.length > 0 ? (
                  <s-stack direction="block" gap="small">
                    <s-text type="strong">
                      Products ({triggers.products.length})
                    </s-text>
                    {triggers.products.map((product) => (
                      <s-box
                        key={product.id}
                        padding="small"
                        border="base"
                        borderRadius="base"
                        background="subdued"
                      >
                        <s-stack
                          direction="inline"
                          gap="base"
                          alignItems="center"
                        >
                          {product.imageUrl ? (
                            <s-thumbnail
                              src={product.imageUrl}
                              alt={product.title}
                              size="small"
                            />
                          ) : null}
                          <s-text>{product.title}</s-text>
                          <s-button
                            variant="tertiary"
                            tone="critical"
                            onClick={() => removeProduct(product.id)}
                          >
                            Remove
                          </s-button>
                        </s-stack>
                      </s-box>
                    ))}
                  </s-stack>
                ) : null}

                {triggers.collections.length > 0 ? (
                  <s-stack direction="block" gap="small">
                    <s-text type="strong">
                      Collections ({triggers.collections.length})
                    </s-text>
                    {triggers.collections.map((collection) => (
                      <s-box
                        key={collection.id}
                        padding="small"
                        border="base"
                        borderRadius="base"
                        background="subdued"
                      >
                        <s-stack
                          direction="inline"
                          gap="base"
                          alignItems="center"
                        >
                          {collection.imageUrl ? (
                            <s-thumbnail
                              src={collection.imageUrl}
                              alt={collection.title}
                              size="small"
                            />
                          ) : null}
                          <s-text>{collection.title}</s-text>
                          <s-button
                            variant="tertiary"
                            tone="critical"
                            onClick={() => removeCollection(collection.id)}
                          >
                            Remove
                          </s-button>
                        </s-stack>
                      </s-box>
                    ))}
                  </s-stack>
                ) : null}
              </s-stack>
            ) : null}
          </s-stack>
        </s-box>
      </s-section>
    </s-stack>
  );
}

export function FunnelTriggerSummary({
  triggers,
}: {
  triggers: FunnelTriggers;
}) {
  if (!triggers.productCollectionEnabled) {
    return (
      <s-text tone="neutral" color="subdued">
        All customers (traffic percentage applies)
      </s-text>
    );
  }

  const parts: string[] = [];
  if (triggers.products.length > 0) {
    parts.push(
      `${triggers.products.length} product${triggers.products.length === 1 ? "" : "s"}`,
    );
  }
  if (triggers.collections.length > 0) {
    parts.push(
      `${triggers.collections.length} collection${triggers.collections.length === 1 ? "" : "s"}`,
    );
  }

  return (
    <s-stack direction="block" gap="small">
      <s-text type="strong">Product / Collection</s-text>
      <s-text tone="neutral" color="subdued">
        Shows when the order includes any of: {parts.join(" or ") || "none selected"}.
      </s-text>
      {triggers.products.length > 0 ? (
        <s-stack direction="block" gap="small">
          {triggers.products.map((product) => (
            <s-text key={product.id}>{product.title}</s-text>
          ))}
        </s-stack>
      ) : null}
      {triggers.collections.length > 0 ? (
        <s-stack direction="block" gap="small">
          {triggers.collections.map((collection) => (
            <s-text key={collection.id}>{collection.title}</s-text>
          ))}
        </s-stack>
      ) : null}
    </s-stack>
  );
}
