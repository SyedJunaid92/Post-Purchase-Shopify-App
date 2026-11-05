export type TestStatus = "active" | "draft" | "paused" | "closed";

export type TestType =
  | "product_offer"
  | "quiz"
  | "survey"
  | "trial_unlock"
  | "combo";

export type PostPurchaseTest = {
  id: string;
  name: string;
  status: TestStatus;
  type: TestType;
  trafficPercentage: number;
  createdAt: string;
  updatedAt: string;
};

export const TEST_TYPE_LABELS: Record<TestType, string> = {
  product_offer: "Product offer",
  trial_unlock: "Subscription Product Offer",
  quiz: "Quiz Product Offer",
  survey: "Survey Product Offer",
  combo: "Combo",
};

export const TEST_STATUS_LABELS: Record<TestStatus, string> = {
  active: "Active",
  draft: "Draft",
  paused: "Paused",
  closed: "Closed",
};

export const TEST_STATUS_TONE: Record<
  TestStatus,
  "success" | "info" | "warning" | "critical" | "neutral"
> = {
  active: "success",
  draft: "info",
  paused: "warning",
  closed: "neutral",
};
