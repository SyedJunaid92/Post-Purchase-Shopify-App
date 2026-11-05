import postgres from "postgres";

export type ShopConfig = {
  id?: string;
  shop: string;
  enabled: boolean;
  traffic_percentage: number;
  product_id: string | null;
  product_title: string | null;
  product_image_url: string | null;
  variant_id: string | null;
  variant_legacy_id: string | null;
  product_price: string | null;
  custom_description: string | null;
  discount_percentage: number;
  headline: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PostPurchaseEvent = {
  shop: string;
  reference_id: string;
  event_type: "shown" | "accepted" | "declined" | "skipped_traffic";
};

let sql: ReturnType<typeof postgres> | null = null;

function getSql() {
  if (sql) return sql;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL environment variable");
  }

  sql = postgres(url, { prepare: false });
  return sql;
}

export async function getShopConfig(shop: string): Promise<ShopConfig | null> {
  const db = getSql();
  const rows = await db<ShopConfig[]>`
    select * from shop_configs where shop = ${shop} limit 1
  `;
  return rows[0] ?? null;
}

export async function upsertShopConfig(
  config: Omit<ShopConfig, "id" | "created_at" | "updated_at">,
): Promise<ShopConfig> {
  const db = getSql();
  const rows = await db<ShopConfig[]>`
    insert into shop_configs (
      shop,
      enabled,
      traffic_percentage,
      product_id,
      product_title,
      product_image_url,
      variant_id,
      variant_legacy_id,
      product_price,
      custom_description,
      discount_percentage,
      headline,
      updated_at
    ) values (
      ${config.shop},
      ${config.enabled},
      ${config.traffic_percentage},
      ${config.product_id},
      ${config.product_title},
      ${config.product_image_url},
      ${config.variant_id},
      ${config.variant_legacy_id},
      ${config.product_price},
      ${config.custom_description},
      ${config.discount_percentage},
      ${config.headline},
      now()
    )
    on conflict (shop) do update set
      enabled = excluded.enabled,
      traffic_percentage = excluded.traffic_percentage,
      product_id = excluded.product_id,
      product_title = excluded.product_title,
      product_image_url = excluded.product_image_url,
      variant_id = excluded.variant_id,
      variant_legacy_id = excluded.variant_legacy_id,
      product_price = excluded.product_price,
      custom_description = excluded.custom_description,
      discount_percentage = excluded.discount_percentage,
      headline = excluded.headline,
      updated_at = now()
    returning *
  `;
  return rows[0];
}

export async function deleteShopConfig(shop: string): Promise<void> {
  const db = getSql();
  await db`delete from shop_configs where shop = ${shop}`;
}

export async function deletePostPurchaseEventsForShop(
  shop: string,
): Promise<void> {
  const db = getSql();
  await db`delete from post_purchase_events where shop = ${shop}`;
}

export async function logPostPurchaseEvent(
  event: PostPurchaseEvent,
): Promise<void> {
  const db = getSql();
  await db`
    insert into post_purchase_events (shop, reference_id, event_type)
    values (${event.shop}, ${event.reference_id}, ${event.event_type})
  `;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
