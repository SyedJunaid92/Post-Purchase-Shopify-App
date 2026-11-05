import { deleteShopConfig, deletePostPurchaseEventsForShop, isSupabaseConfigured } from "./supabase.server";
import { deleteTestsForShop } from "./tests.server";
import { deleteAnalyticsForShop } from "./analytics.server";
import { deleteShopBillingRecord } from "./billing-records.server";
import { invalidateOfferCache } from "./offer-cache.server";
import db from "../db.server";

export async function redactShopData(shop: string): Promise<void> {
  invalidateOfferCache(shop);

  await Promise.all([
    db.session.deleteMany({ where: { shop } }).catch(console.error),
    db.processedWebhook.deleteMany({ where: { shop } }).catch(console.error),
    deleteShopBillingRecord(shop),
  ]);

  if (!isSupabaseConfigured()) return;

  await Promise.all([
    deleteShopConfig(shop).catch(console.error),
    deleteTestsForShop(shop).catch(console.error),
    deleteAnalyticsForShop(shop).catch(console.error),
    deletePostPurchaseEventsForShop(shop).catch(console.error),
  ]);
}

export async function redactCustomerData(
  shop: string,
  ordersToRedact: number[] = [],
): Promise<void> {
  if (!isSupabaseConfigured() || ordersToRedact.length === 0) return;

  const orderIds = ordersToRedact.map(String);
  const { getAnalyticsSql } = await import("./analytics.server");
  const sql = getAnalyticsSql();
  await sql`
    delete from analytics_events
    where shop = ${shop}
      and reference_id = any(${orderIds})
  `.catch(console.error);
}
