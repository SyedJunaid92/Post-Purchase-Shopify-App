import type { PostPurchaseTest } from "./tests.types";

export const MOCK_TESTS: PostPurchaseTest[] = [
  {
    id: "test_1",
    name: "Multi URL Test",
    status: "paused",
    type: "product_offer",
    trafficPercentage: 50,
    createdAt: "2026-06-15T10:00:00.000Z",
    updatedAt: "2026-06-16T08:30:00.000Z",
  },
];

export function formatTestDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function countTestsByStatus(tests: PostPurchaseTest[]) {
  return {
    all: tests.length,
    active: tests.filter((t) => t.status === "active").length,
    draft: tests.filter((t) => t.status === "draft").length,
    paused: tests.filter((t) => t.status === "paused").length,
    closed: tests.filter((t) => t.status === "closed").length,
  };
}
