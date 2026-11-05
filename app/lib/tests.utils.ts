import type { Test } from "./tests.server";

export function formatTestDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function countTestsByStatus(tests: Pick<Test, "status">[]) {
  return {
    all: tests.length,
    active: tests.filter((t) => t.status === "active").length,
    draft: tests.filter((t) => t.status === "draft").length,
    paused: tests.filter((t) => t.status === "paused").length,
    closed: tests.filter((t) => t.status === "closed").length,
  };
}

export function averageTraffic(tests: Test[]): string {
  const active = tests.filter((t) => t.status === "active");
  if (!active.length) return "—";
  const avg =
    active.reduce((sum, t) => sum + t.trafficPercentage, 0) / active.length;
  return `${Math.round(avg)}%`;
}
