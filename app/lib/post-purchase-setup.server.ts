import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export type PostPurchaseAppStatus = {
  active: boolean;
  /** inactive = Shopify reports another/missing app; unknown = API error */
  state: "active" | "inactive" | "unknown";
  /** Dev/partner stores where Shopify often misreports post-purchase status */
  isDevStore?: boolean;
};

async function isPartnerDevelopmentStore(
  admin: AdminApiContext,
): Promise<boolean> {
  try {
    const response = await admin.graphql(`#graphql
      query ShopDevelopmentPlan {
        shop {
          plan {
            partnerDevelopment
          }
        }
      }
    `);
    const json = await response.json();
    return Boolean(json?.data?.shop?.plan?.partnerDevelopment);
  } catch {
    return false;
  }
}

export async function getPostPurchaseAppStatus(
  admin: AdminApiContext,
  options?: { billingTest?: boolean },
): Promise<PostPurchaseAppStatus> {
  const isDevStore =
    options?.billingTest ?? (await isPartnerDevelopmentStore(admin));

  try {
    const response = await admin.graphql(`#graphql
      query PostPurchaseAppStatus {
        app {
          isPostPurchaseAppInUse
        }
      }
    `);
    const json = (await response.json()) as {
      data?: {
        app?: { isPostPurchaseAppInUse?: boolean };
      };
      errors?: Array<{ message?: string }>;
    };

    if (json.errors?.length) {
      console.error(
        "PostPurchaseAppStatus GraphQL errors:",
        json.errors.map((e) => e.message).join("; "),
      );
      if (isDevStore) {
        return { active: true, state: "active", isDevStore: true };
      }
      return { active: false, state: "unknown", isDevStore };
    }

    const active = Boolean(json.data?.app?.isPostPurchaseAppInUse);

    // Partner dev stores often return false/unknown even when checkout is configured.
    if (isDevStore) {
      return { active: true, state: "active", isDevStore: true };
    }

    return { active, state: active ? "active" : "inactive", isDevStore };
  } catch (error) {
    console.error("getPostPurchaseAppStatus failed:", error);
    if (isDevStore) {
      return { active: true, state: "active", isDevStore: true };
    }
    return { active: false, state: "unknown", isDevStore };
  }
}

/** @deprecated Use getPostPurchaseAppStatus */
export async function getIsPostPurchaseAppInUse(
  admin: AdminApiContext,
): Promise<boolean> {
  const status = await getPostPurchaseAppStatus(admin);
  return status.active;
}

/** Admin checkout settings (post-purchase page). Use with target="_top" in embedded apps. */
export function checkoutSettingsUrl(): string {
  return "shopify://admin/settings/checkout";
}
