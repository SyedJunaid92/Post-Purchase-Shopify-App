-- Run this in your Supabase SQL editor

create table if not exists shop_configs (
  id uuid primary key default gen_random_uuid(),
  shop text unique not null,
  enabled boolean not null default true,
  traffic_percentage integer not null default 100
    check (traffic_percentage >= 0 and traffic_percentage <= 100),
  product_id text,
  product_title text,
  product_image_url text,
  variant_id text,
  variant_legacy_id text,
  product_price text,
  custom_description text,
  discount_percentage numeric not null default 0
    check (discount_percentage >= 0 and discount_percentage <= 100),
  headline text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists post_purchase_events (
  id uuid primary key default gen_random_uuid(),
  shop text not null,
  reference_id text not null,
  event_type text not null
    check (event_type in ('shown', 'accepted', 'declined', 'skipped_traffic')),
  created_at timestamptz not null default now()
);

create index if not exists idx_post_purchase_events_shop
  on post_purchase_events (shop, created_at desc);
create index if not exists idx_post_purchase_events_reference
  on post_purchase_events (shop, reference_id);

create index if not exists idx_shop_configs_shop
  on shop_configs (shop);

-- Shopify OAuth sessions (Prisma)
create table if not exists "Session" (
  id text primary key,
  shop text not null,
  state text not null,
  "isOnline" boolean not null default false,
  scope text,
  expires timestamptz,
  "accessToken" text not null,
  "userId" bigint,
  "firstName" text,
  "lastName" text,
  email text,
  "accountOwner" boolean not null default false,
  locale text,
  collaborator boolean default false,
  "emailVerified" boolean default false,
  "refreshToken" text,
  "refreshTokenExpires" timestamptz
);

create index if not exists "Session_shop_idx" on "Session" (shop);

-- Webhook idempotency (Prisma)
create table if not exists "ProcessedWebhook" (
  id text primary key default gen_random_uuid()::text,
  "webhookId" text not null unique,
  shop text not null,
  topic text not null,
  "createdAt" timestamptz not null default now()
);

create index if not exists "ProcessedWebhook_shop_idx"
  on "ProcessedWebhook" (shop);
create index if not exists "ProcessedWebhook_shop_topic_idx"
  on "ProcessedWebhook" (shop, topic);
create index if not exists "ProcessedWebhook_createdAt_idx"
  on "ProcessedWebhook" ("createdAt");

-- Tests (post-purchase experiments)
create table if not exists tests (
  id uuid primary key default gen_random_uuid(),
  shop text not null,
  name text not null,
  status text not null default 'draft'
    check (status in ('active', 'draft', 'paused', 'closed')),
  type text not null
    check (type in ('product_offer', 'trial_unlock', 'quiz', 'survey', 'combo')),
  traffic_percentage integer not null default 100
    check (traffic_percentage >= 0 and traffic_percentage <= 100),
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tests_shop on tests (shop);
create index if not exists idx_tests_shop_status on tests (shop, status);
create index if not exists idx_tests_shop_updated_at
  on tests (shop, updated_at desc);
create index if not exists idx_tests_shop_status_updated_at
  on tests (shop, status, updated_at desc);
create index if not exists idx_tests_shop_id on tests (shop, id);

create extension if not exists pg_trgm;
create index if not exists idx_tests_name_trgm
  on tests using gin (name gin_trgm_ops);

-- Analytics events (all customer interactions)
create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  shop text not null,
  test_id uuid references tests(id) on delete set null,
  reference_id text,
  session_id text,
  event_type text not null,
  event_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_shop_created
  on analytics_events (shop, created_at desc);
create index if not exists idx_analytics_test
  on analytics_events (shop, test_id, event_type);
create index if not exists idx_analytics_shop_event_type
  on analytics_events (shop, event_type);
create index if not exists idx_analytics_shop_event_created
  on analytics_events (shop, event_type, created_at desc);
create index if not exists idx_analytics_shop_test_event_created
  on analytics_events (shop, test_id, event_type, created_at desc);
create index if not exists idx_analytics_shop_combo_variant
  on analytics_events (shop)
  where (event_data->>'comboVariant') is not null;
create index if not exists idx_analytics_shop_test_id
  on analytics_events (shop, test_id)
  where test_id is not null;
create index if not exists idx_analytics_shop_reference
  on analytics_events (shop, reference_id)
  where reference_id is not null;
create index if not exists idx_analytics_conversion_lookup
  on analytics_events (shop, event_type, reference_id, created_at desc)
  where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
    and reference_id is not null;
create index if not exists idx_analytics_step_viewed
  on analytics_events (shop, test_id)
  where event_type = 'step_viewed';
create index if not exists idx_analytics_combo_variant_expr
  on analytics_events (shop, test_id, (event_data->>'comboVariant'))
  where (event_data->>'comboVariant') is not null;

alter table tests enable row level security;
alter table analytics_events enable row level security;

alter table post_purchase_events enable row level security;

-- Daily totals. Analytics pages read this table. The hourly cron rewrites the
-- current UTC day (delete, then insert) and only inserts older days that are missing.
create table if not exists analytics_daily (
  shop text not null,
  day date not null,
  test_key text not null,
  test_id uuid,
  shown integer not null default 0,
  qualified integer not null default 0,
  rejected integer not null default 0,
  accepted integer not null default 0,
  declined integer not null default 0,
  auto_added integer not null default 0,
  completed integer not null default 0,
  api_checks integer not null default 0,
  revenue_usd numeric(14,2) not null default 0,
  orders_with_revenue integer not null default 0,
  combo_split jsonb not null default '[]'::jsonb,
  funnel_steps jsonb not null default '[]'::jsonb,
  funnel_types jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (shop, day, test_key)
);

create index if not exists analytics_daily_shop_day_idx
  on analytics_daily (shop, day desc);

create table if not exists analytics_rollup_state (
  shop text primary key,
  oldest_filled date
);

alter table analytics_daily enable row level security;
alter table analytics_rollup_state enable row level security;

-- Service role bypasses RLS; no public policies needed for server-side access.
