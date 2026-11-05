import postgres from "postgres";
import type {
  ProductOfferConfig,
  TrialUnlockConfig,
  ScoredQuizConfig,
  SurveyRewardConfig,
  ComboTestConfig,
} from "./test-config.types";
import {
  DEFAULT_PRODUCT_OFFER_CONFIG,
  DEFAULT_TRIAL_UNLOCK_CONFIG,
  DEFAULT_SCORED_QUIZ_CONFIG,
  DEFAULT_SURVEY_REWARD_CONFIG,
  DEFAULT_COMBO_TEST_CONFIG,
} from "./test-config.types";
import type { TestStatus, TestType } from "./tests.types";
import { invalidateOfferCacheNow } from "./offer-cache.server";
import {
  defaultFunnelTriggers,
  normalizeFunnelTriggers,
  type FunnelTriggers,
} from "./funnel-triggers.types";

export type TestConfig =
  | ProductOfferConfig
  | TrialUnlockConfig
  | ScoredQuizConfig
  | SurveyRewardConfig
  | ComboTestConfig;

export type TestRow = {
  id: string;
  shop: string;
  name: string;
  status: TestStatus;
  type: TestType;
  traffic_percentage: number;
  config: TestConfig | Record<string, unknown>;
  triggers?: FunnelTriggers | Record<string, unknown>;
  created_at: string | Date;
  updated_at: string | Date;
};

export type Test = {
  id: string;
  shop: string;
  name: string;
  status: TestStatus;
  type: TestType;
  trafficPercentage: number;
  config: TestConfig;
  triggers: FunnelTriggers;
  createdAt: string;
  updatedAt: string;
};

let sql: ReturnType<typeof postgres> | null = null;
let schemaEnsured = false;

const ALLOWED_TEST_TYPES_SQL = `'product_offer', 'trial_unlock', 'quiz', 'survey', 'combo'`;

function getSql() {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");
  sql = postgres(url, { prepare: false });
  return sql;
}

/** Updates the tests.type check constraint when the DB predates combo tests. */
export async function ensureTestsSchema(): Promise<void> {
  if (schemaEnsured) return;

  const db = getSql();

  try {
    await db.unsafe(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'public.tests'::regclass
            AND contype = 'c'
            AND pg_get_constraintdef(oid) ILIKE '%type%'
        LOOP
          EXECUTE format('ALTER TABLE tests DROP CONSTRAINT %I', r.conname);
        END LOOP;
      END $$;
    `);

    await db.unsafe(`
      ALTER TABLE tests ADD CONSTRAINT tests_type_check
        CHECK (type IN (${ALLOWED_TEST_TYPES_SQL}));
    `);
    await db.unsafe(`
      ALTER TABLE tests ADD COLUMN IF NOT EXISTS triggers jsonb NOT NULL DEFAULT '{}'::jsonb;
    `);
    await db.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_tests_shop_id ON tests (shop, id)
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Constraint already exists with the correct definition — safe to continue.
    if (!message.includes("already exists")) {
      console.error("ensureTestsSchema:", message);
    }
  }

  schemaEnsured = true;
}

export function formatTestDbError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("tests_type_check") ||
    message.includes("violates check constraint")
  ) {
    return "Database schema is outdated. Combo test type is not allowed yet — run the migration in Supabase.";
  }
  if (message.includes("duplicate key")) {
    return "A test with this configuration already exists.";
  }
  return `Failed to save funnel: ${message}`;
}

/** The postgres driver returns timestamp columns as Date objects; normalize to ISO strings. */
function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapTest(row: TestRow): Test {
  return {
    id: row.id,
    shop: row.shop,
    name: row.name,
    status: row.status,
    type: row.type,
    trafficPercentage: row.traffic_percentage,
    config: row.config as TestConfig,
    triggers: normalizeFunnelTriggers(row.triggers),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function defaultConfigForType(type: TestType): TestConfig {
  if (type === "product_offer") return DEFAULT_PRODUCT_OFFER_CONFIG();
  if (type === "trial_unlock") return DEFAULT_TRIAL_UNLOCK_CONFIG();
  if (type === "quiz") return DEFAULT_SCORED_QUIZ_CONFIG();
  if (type === "survey") return DEFAULT_SURVEY_REWARD_CONFIG();
  if (type === "combo") return DEFAULT_COMBO_TEST_CONFIG();
  return DEFAULT_PRODUCT_OFFER_CONFIG();
}

export async function listTests(
  shop: string,
  options?: { search?: string },
): Promise<Test[]> {
  const db = getSql();
  const search = options?.search?.trim().replace(/[%_]/g, "") ?? "";
  const rows = search
    ? await db<TestRow[]>`
        select * from tests
        where shop = ${shop}
          and name ilike ${"%" + search + "%"}
        order by updated_at desc
      `
    : await db<TestRow[]>`
        select * from tests
        where shop = ${shop}
        order by updated_at desc
      `;
  return rows.map(mapTest);
}

export async function getTest(shop: string, id: string): Promise<Test | null> {
  const db = getSql();
  const rows = await db<TestRow[]>`
    select * from tests where shop = ${shop} and id = ${id} limit 1
  `;
  return rows[0] ? mapTest(rows[0]) : null;
}

export async function getActiveTest(shop: string): Promise<Test | null> {
  const db = getSql();
  const rows = await db<TestRow[]>`
    select * from tests
    where shop = ${shop} and status = 'active'
    order by updated_at desc
    limit 1
  `;
  return rows[0] ? mapTest(rows[0]) : null;
}

export async function createTest(input: {
  shop: string;
  name: string;
  status: TestStatus;
  type: TestType;
  trafficPercentage: number;
  config?: TestConfig;
  triggers?: FunnelTriggers;
}): Promise<Test> {
  await ensureTestsSchema();
  const db = getSql();
  const config = input.config ?? defaultConfigForType(input.type);
  const triggers = normalizeFunnelTriggers(input.triggers ?? defaultFunnelTriggers());
  const rows = await db<TestRow[]>`
    insert into tests (shop, name, status, type, traffic_percentage, config, triggers)
    values (
      ${input.shop},
      ${input.name},
      ${input.status},
      ${input.type},
      ${input.trafficPercentage},
      ${db.json(config as unknown as postgres.JSONValue)},
      ${db.json(triggers as unknown as postgres.JSONValue)}
    )
    returning *
  `;
  await invalidateOfferCacheNow(input.shop);
  return mapTest(rows[0]);
}

export async function updateTest(
  shop: string,
  id: string,
  input: Partial<{
    name: string;
    status: TestStatus;
    trafficPercentage: number;
    config: TestConfig;
    triggers: FunnelTriggers;
  }>,
): Promise<Test | null> {
  await ensureTestsSchema();
  const existing = await getTest(shop, id);
  if (!existing) return null;

  const db = getSql();
  const rows = await db<TestRow[]>`
    update tests set
      name = ${input.name ?? existing.name},
      status = ${input.status ?? existing.status},
      traffic_percentage = ${input.trafficPercentage ?? existing.trafficPercentage},
      config = ${db.json((input.config ?? existing.config) as unknown as postgres.JSONValue)},
      triggers = ${db.json(normalizeFunnelTriggers(input.triggers ?? existing.triggers) as unknown as postgres.JSONValue)},
      updated_at = now()
    where shop = ${shop} and id = ${id}
    returning *
  `;
  await invalidateOfferCacheNow(shop);
  return rows[0] ? mapTest(rows[0]) : null;
}

export async function deleteTest(shop: string, id: string): Promise<void> {
  const db = getSql();
  await db`delete from tests where shop = ${shop} and id = ${id}`;
  await invalidateOfferCacheNow(shop);
}

export async function deleteTestsForShop(shop: string): Promise<void> {
  const db = getSql();
  await db`delete from tests where shop = ${shop}`;
  await invalidateOfferCacheNow(shop);
}
