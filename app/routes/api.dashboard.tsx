import type { LoaderFunctionArgs } from "react-router";
import { loadDashboardApiData } from "../lib/dashboard-data.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const data = await loadDashboardApiData(request);
  return Response.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
};
