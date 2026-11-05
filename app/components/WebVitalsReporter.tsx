import { useEffect } from "react";
import { onCLS, onINP, onLCP } from "web-vitals";

type VitalMetric = {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  id: string;
};

function reportVital(metric: VitalMetric) {
  if (typeof window === "undefined") return;

  const payload = {
    name: metric.name,
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    rating: metric.rating,
    id: metric.id,
    path: window.location.pathname,
    recordedAt: new Date().toISOString(),
  };

  if (import.meta.env.DEV) {
    console.debug("[Web Vitals]", payload);
  }

  try {
    const key = `pp-web-vitals:${metric.name}`;
    window.sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore storage failures in restrictive iframe contexts.
  }
}

/** Measures Core Web Vitals inside the embedded admin iframe for LCP debugging. */
export function WebVitalsReporter() {
  useEffect(() => {
    onLCP(reportVital);
    onCLS(reportVital);
    onINP(reportVital);
  }, []);

  return null;
}
