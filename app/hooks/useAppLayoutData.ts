import { useRouteLoaderData } from "react-router";
import type { loader as appLoader } from "../routes/app";

export function useAppLayoutData() {
  return useRouteLoaderData<typeof appLoader>("routes/app");
}
