-- Uninstall/redact deletes webhooks by shop; topic lookups for idempotency ops
CREATE INDEX IF NOT EXISTS "ProcessedWebhook_shop_idx"
  ON "ProcessedWebhook" ("shop");

CREATE INDEX IF NOT EXISTS "ProcessedWebhook_shop_topic_idx"
  ON "ProcessedWebhook" ("shop", "topic");

CREATE INDEX IF NOT EXISTS "ProcessedWebhook_createdAt_idx"
  ON "ProcessedWebhook" ("createdAt");
