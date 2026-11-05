import type { TestType } from "./tests.types";
import { TEST_TYPE_LABELS } from "./tests.types";

export type FunnelTypeCatalogEntry = {
  type: TestType;
  category: string;
  title: string;
  description: string;
  icon: "product" | "gift-card" | "forms" | "list-bulleted" | "chart-vertical";
  iconBackground: string;
};

export const FUNNEL_TYPE_CATALOG: FunnelTypeCatalogEntry[] = [
  {
    type: "product_offer",
    category: "POST-PURCHASE",
    title: TEST_TYPE_LABELS.product_offer,
    description:
      "Offer a one-click upsell product immediately after checkout. Increase average order value with a targeted product offer.",
    icon: "product",
    iconBackground: "#e3f1df",
  },
  {
    type: "trial_unlock",
    category: "SUBSCRIPTION",
    title: TEST_TYPE_LABELS.trial_unlock,
    description:
      "Showcase a subscription trial after purchase. Let shoppers start a trial for a subscription product on the thank-you page.",
    icon: "gift-card",
    iconBackground: "#e3f0ff",
  },
  {
    type: "quiz",
    category: "ENGAGEMENT",
    title: TEST_TYPE_LABELS.quiz,
    description:
      "Run a scored quiz after checkout. Shoppers who pass automatically receive a reward product added to their order.",
    icon: "forms",
    iconBackground: "#f0e9ff",
  },
  {
    type: "survey",
    category: "ENGAGEMENT",
    title: TEST_TYPE_LABELS.survey,
    description:
      "Collect post-purchase feedback with a short survey. Reward completion with a product offer shoppers can accept in one click.",
    icon: "list-bulleted",
    iconBackground: "#fce7f3",
  },
  {
    type: "combo",
    category: "ADVANCED",
    title: TEST_TYPE_LABELS.combo,
    description:
      "Split traffic across subscription, quiz, and survey flows in one test. Compare performance for every variant on a single page.",
    icon: "chart-vertical",
    iconBackground: "#fff4e5",
  },
];

export const ALL_FUNNEL_TYPES = FUNNEL_TYPE_CATALOG.map((entry) => entry.type);

export function isFunnelType(value: string | undefined): value is TestType {
  return ALL_FUNNEL_TYPES.includes(value as TestType);
}
