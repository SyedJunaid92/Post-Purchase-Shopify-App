import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { isSupabaseConfigured } from "../lib/supabase.server";
import { listTests } from "../lib/tests.server";
import {
  getFunnelTypeBreakdown,
  getTestAnalyticsSummaries,
  getUsdFxRates,
} from "../lib/analytics.server";
import { countTestsByStatus } from "../lib/tests.utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (!isSupabaseConfigured()) {
    return Response.json({
      tests: [],
      counts: countTestsByStatus([]),
      summaries: [],
      funnelTypeBreakdown: [],
      fx: null,
    });
  }

  const [testsResult, analyticsResult] = await Promise.all([
    listTests(session.shop)
      .then((tests) => ({
        tests,
        counts: countTestsByStatus(tests),
      }))
      .catch(() => ({
        tests: [],
        counts: countTestsByStatus([]),
      })),
    Promise.all([
      getTestAnalyticsSummaries(session.shop).catch(() => []),
      getFunnelTypeBreakdown(session.shop).catch(() => []),
      getUsdFxRates().catch(() => null),
    ]).then(([summaries, funnelTypeBreakdown, fx]) => ({
      summaries,
      funnelTypeBreakdown,
      fx,
    })),
  ]);

  return Response.json({
    ...testsResult,
    ...analyticsResult,
  });
};
