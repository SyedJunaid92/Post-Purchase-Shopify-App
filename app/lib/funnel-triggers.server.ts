import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  gidLegacyId,
  normalizeFunnelTriggers,
  orderMatchesProductCollectionTrigger,
  validateFunnelTriggers,
  type FunnelTriggers,
  type PurchaseLineItem,
} from "./funnel-triggers.types";

export { validateFunnelTriggers };

export async function fetchCollectionProductLegacyIds(
  admin: AdminApiContext,
  collectionId: string,
): Promise<string[]> {
  const ids = new Set<string>();
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: Response = await admin.graphql(
      `#graphql
      query TriggerCollectionProducts($id: ID!, $first: Int!, $after: String) {
        collection(id: $id) {
          products(first: $first, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
            }
          }
        }
      }`,
      {
        variables: {
          id: collectionId,
          first: 100,
          after: cursor,
        },
      },
    );

    const json: {
      data?: {
        collection?: {
          products?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            nodes?: Array<{ id?: string }>;
          };
        };
      };
    } = await response.json();
    const products = json.data?.collection?.products;
    if (!products) break;

    for (const node of products.nodes ?? []) {
      if (node?.id) ids.add(gidLegacyId(node.id));
    }

    hasNextPage = Boolean(products.pageInfo?.hasNextPage);
    cursor = products.pageInfo?.endCursor ?? null;

    if (ids.size >= 500) break;
  }

  return [...ids];
}

export async function resolveFunnelTriggersForSave(
  admin: AdminApiContext,
  triggers: FunnelTriggers,
): Promise<FunnelTriggers> {
  const normalized = normalizeFunnelTriggers(triggers);
  if (!normalized.productCollectionEnabled) {
    return normalized;
  }

  const collections = await Promise.all(
    normalized.collections.map(async (collection) => {
      const productLegacyIds = await fetchCollectionProductLegacyIds(
        admin,
        collection.id,
      );
      return {
        ...collection,
        productLegacyIds,
      };
    }),
  );

  return {
    ...normalized,
    collections,
  };
}

export function shouldShowFunnelForPurchase(
  triggers: FunnelTriggers,
  lineItems: PurchaseLineItem[],
): boolean {
  return orderMatchesProductCollectionTrigger(
    lineItems,
    normalizeFunnelTriggers(triggers),
  );
}
