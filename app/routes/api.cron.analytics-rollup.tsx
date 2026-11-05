import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authorizeCron } from "../lib/cron-auth.server";
import { refreshHourlyAnalyticsRollup } from "../lib/analytics-daily.server";

export const maxDuration = 60;

/**
 * Vercel Cron: GET /api/cron/analytics-rollup every hour.
 * Replaces only today's analytics_daily rows. Past days are inserted once
 * when missing, and existing past rows are not deleted or rewritten.
 */
async function runRollup() {
  return refreshHourlyAnalyticsRollup();
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!authorizeCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runRollup();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/analytics-rollup] failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!authorizeCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runRollup();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/analytics-rollup] failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
};
