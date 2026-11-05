-- Session: webhook handlers and shop-scoped session lookups
CREATE INDEX IF NOT EXISTS "Session_shop_idx" ON "Session"("shop");

-- Analytics: dashboard aggregates and step_viewed queries (shop + event_type)
CREATE INDEX IF NOT EXISTS idx_analytics_shop_event_type
  ON analytics_events (shop, event_type);

-- Analytics: combo split dashboard query (shop rows with comboVariant set)
CREATE INDEX IF NOT EXISTS idx_analytics_shop_combo_variant
  ON analytics_events (shop)
  WHERE (event_data->>'comboVariant') IS NOT NULL;

-- Analytics: per-test summaries grouped by test_id
CREATE INDEX IF NOT EXISTS idx_analytics_shop_test_id
  ON analytics_events (shop, test_id)
  WHERE test_id IS NOT NULL;

-- Tests: funnel list sorted by updated_at
CREATE INDEX IF NOT EXISTS idx_tests_shop_updated_at
  ON tests (shop, updated_at DESC);

-- Tests: active test lookup (shop + status + most recent)
CREATE INDEX IF NOT EXISTS idx_tests_shop_status_updated_at
  ON tests (shop, status, updated_at DESC);
