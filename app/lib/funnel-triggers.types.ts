export type TriggerProduct = {
  id: string;
  legacyId: string;
  title: string;
  imageUrl?: string | null;
};

export type TriggerCollection = {
  id: string;
  title: string;
  imageUrl?: string | null;
  productLegacyIds: string[];
};

export type FunnelTriggers = {
  productCollectionEnabled: boolean;
  products: TriggerProduct[];
  collections: TriggerCollection[];
};

export type PurchaseLineItem = {
  productId: number;
  variantId?: number;
  quantity?: number;
};

export function defaultFunnelTriggers(): FunnelTriggers {
  return {
    productCollectionEnabled: false,
    products: [],
    collections: [],
  };
}

export function gidLegacyId(gid: string): string {
  const parts = gid.trim().split("/");
  return parts[parts.length - 1] ?? gid;
}

export function normalizeFunnelTriggers(raw: unknown): FunnelTriggers {
  const base = defaultFunnelTriggers();
  if (!raw || typeof raw !== "object") return base;

  const value = raw as Partial<FunnelTriggers>;
  return {
    productCollectionEnabled: Boolean(value.productCollectionEnabled),
    products: Array.isArray(value.products)
      ? value.products
          .filter((item) => item && typeof item === "object")
          .map((item) => {
            const row = item as Partial<TriggerProduct>;
            const id = String(row.id ?? "").trim();
            return {
              id,
              legacyId: String(row.legacyId ?? gidLegacyId(id)),
              title: String(row.title ?? "Product"),
              imageUrl: row.imageUrl ?? null,
            };
          })
          .filter((item) => item.id && item.legacyId)
      : [],
    collections: Array.isArray(value.collections)
      ? value.collections
          .filter((item) => item && typeof item === "object")
          .map((item) => {
            const row = item as Partial<TriggerCollection>;
            const id = String(row.id ?? "").trim();
            return {
              id,
              title: String(row.title ?? "Collection"),
              imageUrl: row.imageUrl ?? null,
              productLegacyIds: Array.isArray(row.productLegacyIds)
                ? row.productLegacyIds.map(String).filter(Boolean)
                : [],
            };
          })
          .filter((item) => item.id)
      : [],
  };
}

export function orderMatchesProductCollectionTrigger(
  lineItems: PurchaseLineItem[],
  triggers: FunnelTriggers,
): boolean {
  if (!triggers.productCollectionEnabled) return true;

  const productIds = new Set<string>();
  for (const product of triggers.products) {
    productIds.add(product.legacyId);
  }
  for (const collection of triggers.collections) {
    for (const legacyId of collection.productLegacyIds) {
      productIds.add(legacyId);
    }
  }

  if (productIds.size === 0) return false;
  if (!lineItems.length) return false;

  return lineItems.some((item) => productIds.has(String(item.productId)));
}

export function validateFunnelTriggers(triggers: FunnelTriggers): string | null {
  const normalized = normalizeFunnelTriggers(triggers);
  if (!normalized.productCollectionEnabled) return null;
  if (
    normalized.products.length === 0 &&
    normalized.collections.length === 0
  ) {
    return "Select at least one product or collection for this trigger.";
  }
  return null;
}
