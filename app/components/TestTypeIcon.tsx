import type { TestType } from "../lib/tests.types";

const TYPE_ICONS = {
  product_offer: "product",
  quiz: "forms",
  survey: "list-bulleted",
  trial_unlock: "gift-card",
  combo: "chart-vertical",
} as const;

type Props = {
  type: TestType;
};

export function TestTypeIcon({ type }: Props) {
  return (
    <s-icon
      type={TYPE_ICONS[type]}
      tone="neutral"
      color="subdued"
      size="base"
    />
  );
}
