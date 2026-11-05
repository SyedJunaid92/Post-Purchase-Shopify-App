-- Daily analytics snapshot. Reads never scan analytics_events.
-- The hourly job deletes and reinserts the current day, and inserts older
-- missing days without touching days that already exist.

CREATE TABLE IF NOT EXISTS analytics_daily (
    shop text NOT NULL,
    day date NOT NULL,
    test_key text NOT NULL,
    test_id uuid,
    shown integer NOT NULL DEFAULT 0,
    qualified integer NOT NULL DEFAULT 0,
    rejected integer NOT NULL DEFAULT 0,
    accepted integer NOT NULL DEFAULT 0,
    declined integer NOT NULL DEFAULT 0,
    auto_added integer NOT NULL DEFAULT 0,
    completed integer NOT NULL DEFAULT 0,
    api_checks integer NOT NULL DEFAULT 0,
    revenue_usd numeric(14,2) NOT NULL DEFAULT 0,
    orders_with_revenue integer NOT NULL DEFAULT 0,
    combo_split jsonb NOT NULL DEFAULT '[]'::jsonb,
    funnel_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
    funnel_types jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (shop, day, test_key)
);

CREATE INDEX IF NOT EXISTS analytics_daily_shop_day_idx
    ON analytics_daily (shop, day DESC);

CREATE TABLE IF NOT EXISTS analytics_rollup_state (
    shop text PRIMARY KEY,
    oldest_filled date
);
