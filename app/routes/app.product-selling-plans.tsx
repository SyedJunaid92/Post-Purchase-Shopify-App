import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export type SellingPlanOption = {
  id: string;
  legacyId: string;
  name: string;
  groupName: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) {
    return Response.json({ plans: [] as SellingPlanOption[] });
  }

  const response = await admin.graphql(
    `#graphql
    query ProductSellingPlans($id: ID!) {
      product(id: $id) {
        sellingPlanGroups(first: 20) {
          nodes {
            name
            sellingPlans(first: 20) {
              nodes {
                id
                name
              }
            }
          }
        }
      }
    }`,
    { variables: { id: productId } },
  );

  const json = await response.json();
  const groups = json.data?.product?.sellingPlanGroups?.nodes ?? [];

  const plans: SellingPlanOption[] = [];
  for (const group of groups) {
    for (const plan of group.sellingPlans?.nodes ?? []) {
      const legacyId = plan.id?.split("/").pop() ?? "";
      if (!legacyId) continue;
      plans.push({
        id: plan.id,
        legacyId,
        name: plan.name,
        groupName: group.name,
      });
    }
  }

  return Response.json({ plans });
};
