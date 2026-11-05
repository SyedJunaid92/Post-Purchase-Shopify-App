import { getAnalyticsSql } from "./analytics.server";
import { getUsdFxRates } from "./fx.server";
import { getRedis } from "./redis.server";

const LOCK_KEY = "analytics:daily-rollup-lock";
const BACKFILL_DAYS_PER_RUN = 40;
const REWRITE_DAYS_PER_RUN = 20;
/** Bump when revenue SQL changes so past days are rebuilt once. */
const REVENUE_ROLLUP_REVISION = 2;

export type DailyCombo = {
  variant: string;
  shown: number;
  converted: number;
  declined: number;
  completed: number;
  qualified: number;
};

export type DailyStep = { step: string; count: number };

export type DailyFunnelType = {
  funnelType: string;
  shown: number;
  converted: number;
  declined: number;
  qualified: number;
  rejected: number;
};

export type DailyTestSummary = {
  testId: string;
  shown: number;
  converted: number;
  revenueUsd: number;
  ordersWithRevenue: number;
};

export type DailyAggregate = {
  shown: number;
  qualified: number;
  rejected: number;
  accepted: number;
  declined: number;
  autoAdded: number;
  completed: number;
  apiChecks: number;
  revenueUsd: number;
  ordersWithRevenue: number;
  comboSplit: DailyCombo[];
  funnelSteps: DailyStep[];
  funnelTypes: DailyFunnelType[];
  byTest: DailyTestSummary[];
};

type DailyRow = {
  test_id: string | null;
  shown: number;
  qualified: number;
  rejected: number;
  accepted: number;
  declined: number;
  auto_added: number;
  completed: number;
  api_checks: number;
  revenue_usd: string | number;
  orders_with_revenue: number;
  combo_split: DailyCombo[] | string;
  funnel_steps: DailyStep[] | string;
  funnel_types: DailyFunnelType[] | string;
};

let schemaReady: Promise<void> | null = null;

export function utcDayString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function ensureAnalyticsDailyTable(): Promise<void> {
  if (!schemaReady) {
    schemaReady = createAnalyticsDailyTable().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function createAnalyticsDailyTable(): Promise<void> {
  const db = getAnalyticsSql();
  const statements = [
    `CREATE TABLE IF NOT EXISTS analytics_daily (
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
    )`,
    `CREATE INDEX IF NOT EXISTS analytics_daily_shop_day_idx
      ON analytics_daily (shop, day DESC)`,
    `CREATE TABLE IF NOT EXISTS analytics_rollup_state (
      shop text PRIMARY KEY,
      oldest_filled date
    )`,
    `ALTER TABLE analytics_rollup_state
      ADD COLUMN IF NOT EXISTS revenue_revision integer NOT NULL DEFAULT 0`,
    `ALTER TABLE analytics_rollup_state
      ADD COLUMN IF NOT EXISTS revenue_cursor date`,
  ];
  for (const statement of statements) {
    await db.unsafe(statement);
  }
}

function parseJson<T>(value: T[] | string | null | undefined): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function emptyAggregate(): DailyAggregate {
  return {
    shown: 0,
    qualified: 0,
    rejected: 0,
    accepted: 0,
    declined: 0,
    autoAdded: 0,
    completed: 0,
    apiChecks: 0,
    revenueUsd: 0,
    ordersWithRevenue: 0,
    comboSplit: [],
    funnelSteps: [],
    funnelTypes: [],
    byTest: [],
  };
}

function sqlDay(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return utcDayString(value);
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : null;
}

function positiveFxRates(
  rates: Record<string, number> | undefined,
): Record<string, number> {
  const fxRates: Record<string, number> = { USD: 1 };
  for (const [code, rate] of Object.entries(rates ?? {})) {
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      fxRates[code.toUpperCase()] = rate;
    }
  }
  return fxRates;
}

/** Replace one shop-day. Previous rows for that day are removed, then the latest totals are inserted. */
export async function rebuildShopDay(
  shop: string,
  day: string,
  rates?: Record<string, number>,
): Promise<number> {
  await ensureAnalyticsDailyTable();
  const db = getAnalyticsSql();
  const end = addUtcDays(day, 1);
  const fxRates = positiveFxRates(rates ?? (await getUsdFxRates()).rates);

  return db.begin(async (tx) => {
    await tx`select set_config('statement_timeout', '20000', true)`;
    await tx`
      delete from analytics_daily
      where shop = ${shop} and day = ${day}::date
    `;
    const inserted = await tx<{ test_key: string }[]>`
      with real_events as (
        select *
        from analytics_events
        where shop = ${shop}
          and created_at >= ${day}::timestamptz
          and created_at < ${end}::timestamptz
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
      ),
      fx as (
        select ${tx.json(fxRates)}::jsonb as rates
      ),
      base as (
        select
          coalesce(test_id::text, '') as test_key,
          test_id,
          count(distinct reference_id) filter (where event_type = 'test_shown')::int as shown,
          count(distinct reference_id) filter (where event_type = 'qualified')::int as qualified,
          count(distinct reference_id) filter (where event_type = 'rejected')::int as rejected,
          count(distinct reference_id) filter (
            where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
          )::int as accepted,
          count(distinct reference_id) filter (where event_type = 'offer_declined')::int as declined,
          count(distinct reference_id) filter (where event_type = 'product_auto_added')::int as auto_added,
          count(distinct reference_id) filter (where event_type = 'test_completed')::int as completed,
          count(distinct reference_id) filter (where event_type = 'offer_config_loaded')::int as api_checks
        from real_events
        group by 1, 2
      ),
      revenue as (
        select
          coalesce(test_id::text, '') as test_key,
          coalesce(sum(amount_usd), 0)::numeric(14,2) as revenue_usd,
          count(*) filter (where amount_usd > 0)::int as orders_with_revenue
        from (
          select distinct on (reference_id)
            test_id,
            case
              when (regexp_match(btrim(coalesce(event_data->>'amountUsd', '')), '^([0-9]+\\.[0-9]+|[0-9]+)$'))[1]::numeric > 0
                then (regexp_match(btrim(event_data->>'amountUsd'), '^([0-9]+\\.[0-9]+|[0-9]+)$'))[1]::numeric
              when (regexp_match(btrim(coalesce(event_data->>'amount', '')), '^([0-9]+\\.[0-9]+|[0-9]+)$'))[1]::numeric > 0
               and upper(coalesce(nullif(btrim(event_data->>'currency'), ''), 'USD')) = 'USD'
                then (regexp_match(btrim(event_data->>'amount'), '^([0-9]+\\.[0-9]+|[0-9]+)$'))[1]::numeric
              when (regexp_match(btrim(coalesce(event_data->>'amount', '')), '^([0-9]+\\.[0-9]+|[0-9]+)$'))[1]::numeric > 0
               and upper(btrim(coalesce(event_data->>'currency', ''))) <> ''
               and upper(btrim(event_data->>'currency')) <> 'USD'
               and (regexp_match(coalesce((select rates from fx) ->> upper(btrim(event_data->>'currency')), ''), '^([0-9]+\\.[0-9]+|[0-9]+)$'))[1]::numeric > 0
                then round(
                  (regexp_match(btrim(event_data->>'amount'), '^([0-9]+\\.[0-9]+|[0-9]+)$'))[1]::numeric
                  / (regexp_match((select rates from fx) ->> upper(btrim(event_data->>'currency')), '^([0-9]+\\.[0-9]+|[0-9]+)$'))[1]::numeric,
                  2
                )
              else 0
            end as amount_usd
          from real_events
          where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
          order by reference_id, created_at desc
        ) orders
        group by 1
      ),
      combo as (
        select
          test_key,
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                'variant', variant,
                'shown', shown,
                'converted', converted,
                'declined', declined,
                'completed', completed,
                'qualified', qualified
              )
              order by shown desc
            ),
            '[]'::jsonb
          ) as combo_split
        from (
          select
            coalesce(test_id::text, '') as test_key,
            coalesce(event_data->>'comboVariant', 'unknown') as variant,
            count(distinct reference_id) filter (where event_type = 'test_shown')::int as shown,
            count(distinct reference_id) filter (
              where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
            )::int as converted,
            count(distinct reference_id) filter (where event_type = 'offer_declined')::int as declined,
            count(distinct reference_id) filter (where event_type = 'test_completed')::int as completed,
            count(distinct reference_id) filter (where event_type = 'qualified')::int as qualified
          from real_events
          where event_data->>'comboVariant' is not null
          group by 1, 2
        ) variants
        group by test_key
      ),
      steps as (
        select
          test_key,
          coalesce(
            jsonb_agg(
              jsonb_build_object('step', step, 'count', step_count)
              order by step_count desc
            ),
            '[]'::jsonb
          ) as funnel_steps
        from (
          select
            coalesce(test_id::text, '') as test_key,
            coalesce(event_data->>'step', 'unknown') as step,
            count(distinct reference_id)::int as step_count
          from real_events
          where event_type = 'step_viewed'
          group by 1, 2
        ) step_rows
        group by test_key
      ),
      types as (
        select
          test_key,
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                'funnelType', funnel_type,
                'shown', shown,
                'converted', converted,
                'declined', declined,
                'qualified', qualified,
                'rejected', rejected
              )
              order by shown desc
            ),
            '[]'::jsonb
          ) as funnel_types
        from (
          select
            coalesce(test_id::text, '') as test_key,
            coalesce(event_data->>'testType', event_data->>'comboVariant', 'unknown') as funnel_type,
            count(distinct reference_id) filter (where event_type = 'test_shown')::int as shown,
            count(distinct reference_id) filter (
              where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
            )::int as converted,
            count(distinct reference_id) filter (where event_type = 'offer_declined')::int as declined,
            count(distinct reference_id) filter (where event_type = 'qualified')::int as qualified,
            count(distinct reference_id) filter (where event_type = 'rejected')::int as rejected
          from real_events
          group by 1, 2
        ) type_rows
        group by test_key
      )
      insert into analytics_daily (
        shop, day, test_key, test_id,
        shown, qualified, rejected, accepted, declined, auto_added, completed, api_checks,
        revenue_usd, orders_with_revenue,
        combo_split, funnel_steps, funnel_types, updated_at
      )
      select
        ${shop},
        ${day}::date,
        base.test_key,
        base.test_id,
        base.shown,
        base.qualified,
        base.rejected,
        base.accepted,
        base.declined,
        base.auto_added,
        base.completed,
        base.api_checks,
        coalesce(revenue.revenue_usd, 0),
        coalesce(revenue.orders_with_revenue, 0),
        coalesce(combo.combo_split, '[]'::jsonb),
        coalesce(steps.funnel_steps, '[]'::jsonb),
        coalesce(types.funnel_types, '[]'::jsonb),
        now()
      from base
      left join revenue on revenue.test_key = base.test_key
      left join combo on combo.test_key = base.test_key
      left join steps on steps.test_key = base.test_key
      left join types on types.test_key = base.test_key
      returning test_key
    `;
    return inserted.length;
  });
}

async function shopsForToday(day: string): Promise<string[]> {
  const db = getAnalyticsSql();
  const end = addUtcDays(day, 1);
  const rows = await db<{ shop: string }[]>`
    select shop from analytics_daily where day = ${day}::date
    union
    select distinct shop from analytics_events
    where created_at >= ${day}::timestamptz
      and created_at < ${end}::timestamptz
  `;
  return rows.map((row) => row.shop);
}

async function missingPastDays(limit: number): Promise<Array<{ shop: string; day: string }>> {
  const db = getAnalyticsSql();
  const yesterday = addUtcDays(utcDayString(), -1);
  const shops = await db<{ shop: string }[]>`
    select distinct shop from tests
    order by shop
    limit 20
  `;
  const missing: Array<{ shop: string; day: string }> = [];

  for (const { shop } of shops) {
    if (missing.length >= limit) break;
    const [state] = await db<{ oldest_filled: Date | string | null }[]>`
      select oldest_filled from analytics_rollup_state where shop = ${shop}
    `;
    const [minRow] = await db<{ day: Date | string | null }[]>`
      select min(created_at) as day
      from analytics_events
      where shop = ${shop}
    `;
    if (!minRow?.day) continue;
    const minDay =
      minRow.day instanceof Date
        ? utcDayString(minRow.day)
        : String(minRow.day).slice(0, 10);
    let cursor = state?.oldest_filled
      ? addUtcDays(
          state.oldest_filled instanceof Date
            ? utcDayString(state.oldest_filled)
            : String(state.oldest_filled).slice(0, 10),
          -1,
        )
      : yesterday;
    let steps = 0;
    while (cursor >= minDay && steps < 14 && missing.length < limit) {
      missing.push({ shop, day: cursor });
      cursor = addUtcDays(cursor, -1);
      steps += 1;
    }
  }

  return missing;
}

async function saveRevenueCursor(
  shop: string,
  revision: number,
  cursor: string | null,
): Promise<void> {
  const db = getAnalyticsSql();
  await db`
    insert into analytics_rollup_state (shop, revenue_revision, revenue_cursor)
    values (${shop}, ${revision}, ${cursor}::date)
    on conflict (shop) do update
      set revenue_revision = excluded.revenue_revision,
          revenue_cursor = excluded.revenue_cursor
  `;
}

/**
 * Past days were rolled up as $0 when the order currency was not USD.
 * Rebuild those shop-days once. New events already store amountUsd.
 */
async function rewriteStoredNonUsdDays(
  limit: number,
  rates: Record<string, number>,
): Promise<number> {
  if (limit <= 0) return 0;
  const db = getAnalyticsSql();
  const yesterday = addUtcDays(utcDayString(), -1);
  const shops = await db<
    {
      shop: string;
      revenue_cursor: Date | string | null;
      min_day: Date | string;
    }[]
  >`
    select e.shop,
           s.revenue_cursor,
           min(e.created_at) as min_day
    from analytics_events e
    left join analytics_rollup_state s on s.shop = e.shop
    where coalesce(s.revenue_revision, 0) < ${REVENUE_ROLLUP_REVISION}
      and e.event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
      and length(coalesce(e.reference_id, '')) >= 12
      and coalesce(e.reference_id, '') !~ '^test'
      and upper(coalesce(nullif(btrim(e.event_data->>'currency'), ''), 'USD')) <> 'USD'
      and (regexp_match(btrim(coalesce(e.event_data->>'amount', '')), '^([0-9]+\\.[0-9]+|[0-9]+)$'))[1]::numeric > 0
      and coalesce(
        (regexp_match(btrim(coalesce(e.event_data->>'amountUsd', '')), '^([0-9]+\\.[0-9]+|[0-9]+)$'))[1]::numeric,
        0
      ) <= 0
    group by e.shop, s.revenue_cursor
    limit 20
  `;

  let rebuilt = 0;
  for (const row of shops) {
    if (rebuilt >= limit) break;
    const minDay = sqlDay(row.min_day);
    if (!minDay) continue;

    let cursor = sqlDay(row.revenue_cursor) ?? yesterday;
    if (cursor > yesterday) cursor = yesterday;
    if (cursor < minDay) {
      await saveRevenueCursor(row.shop, REVENUE_ROLLUP_REVISION, null);
      continue;
    }

    while (cursor >= minDay && rebuilt < limit) {
      try {
        await rebuildShopDay(row.shop, cursor, rates);
      } catch (error) {
        console.error("[analytics-rollup] revenue rewrite failed", {
          shop: row.shop,
          day: cursor,
          error,
        });
        await saveRevenueCursor(row.shop, 0, cursor);
        break;
      }

      rebuilt += 1;
      cursor = addUtcDays(cursor, -1);
      const done = cursor < minDay;
      await saveRevenueCursor(
        row.shop,
        done ? REVENUE_ROLLUP_REVISION : 0,
        done ? null : cursor,
      );
      if (done) break;
    }
  }

  return rebuilt;
}

/**
 * Hourly copy.
 * Today is removed and written again. Past days that were stored before
 * non-USD totals were converted are rebuilt until revenue_revision matches.
 * Other past days are inserted once, only when that day has no row yet.
 * analytics_events is never deleted here.
 */
export async function refreshHourlyAnalyticsRollup(): Promise<{
  today: string;
  rebuiltToday: number;
  backfilled: number;
  rewrittenRevenueDays: number;
}> {
  await ensureAnalyticsDailyTable();
  const redis = getRedis();
  let locked: string | null = "OK";
  if (redis) {
    try {
      locked = await redis.set(LOCK_KEY, "1", { nx: true, ex: 180 });
    } catch (error) {
      console.warn("[analytics-rollup] lock unavailable, running anyway", error);
      locked = "OK";
    }
  }
  if (locked !== "OK") {
    return {
      today: utcDayString(),
      rebuiltToday: 0,
      backfilled: 0,
      rewrittenRevenueDays: 0,
    };
  }

  try {
    const today = utcDayString();
    const rates = positiveFxRates((await getUsdFxRates()).rates);
    const shops = await shopsForToday(today);
    let rebuiltToday = 0;
    for (const shop of shops) {
      try {
        await rebuildShopDay(shop, today, rates);
        rebuiltToday += 1;
      } catch (error) {
        console.error("[analytics-rollup] today rebuild failed", { shop, error });
      }
    }

    let rewrittenRevenueDays = 0;
    try {
      rewrittenRevenueDays = await rewriteStoredNonUsdDays(
        REWRITE_DAYS_PER_RUN,
        rates,
      );
    } catch (error) {
      console.error("[analytics-rollup] revenue rewrite lookup failed", error);
    }

    let backfilled = 0;
    const attempts = new Map<string, Array<{ day: string; ok: boolean }>>();
    try {
      const missing = await missingPastDays(BACKFILL_DAYS_PER_RUN);
      const db = getAnalyticsSql();
      for (const row of missing) {
        const list = attempts.get(row.shop) ?? [];
        try {
          const existing = await db<{ ok: number }[]>`
            select 1 as ok
            from analytics_daily
            where shop = ${row.shop} and day = ${row.day}::date
            limit 1
          `;
          if (existing.length > 0) {
            list.push({ day: row.day, ok: true });
            attempts.set(row.shop, list);
            continue;
          }
          await rebuildShopDay(row.shop, row.day, rates);
          backfilled += 1;
          list.push({ day: row.day, ok: true });
        } catch (error) {
          list.push({ day: row.day, ok: false });
          console.error("[analytics-rollup] backfill failed", { ...row, error });
        }
        attempts.set(row.shop, list);
      }
      for (const [shop, list] of attempts) {
        let oldestOk: string | null = null;
        for (const attempt of list) {
          if (!attempt.ok) break;
          oldestOk = attempt.day;
        }
        if (!oldestOk) continue;
        await db`
          insert into analytics_rollup_state (shop, oldest_filled)
          values (${shop}, ${oldestOk}::date)
          on conflict (shop) do update
            set oldest_filled = least(analytics_rollup_state.oldest_filled, excluded.oldest_filled)
        `;
      }
    } catch (error) {
      console.error("[analytics-rollup] missing-day lookup failed", error);
    }

    return { today, rebuiltToday, backfilled, rewrittenRevenueDays };
  } finally {
    if (redis) {
      try {
        await redis.del(LOCK_KEY);
      } catch {
        // lock expires
      }
    }
  }
}

export async function deleteAnalyticsDailyForShop(shop: string): Promise<void> {
  await ensureAnalyticsDailyTable();
  const db = getAnalyticsSql();
  await db`delete from analytics_daily where shop = ${shop}`;
}

export async function readAnalyticsDaily(
  shop: string,
  scope: { since: Date | null; testIds: string[] | null },
): Promise<DailyAggregate> {
  await ensureAnalyticsDailyTable();
  if (scope.testIds && scope.testIds.length === 0) return emptyAggregate();

  const db = getAnalyticsSql();
  const sinceDay = scope.since ? utcDayString(scope.since) : null;
  const rows = await db<DailyRow[]>`
    select
      test_id::text as test_id,
      shown, qualified, rejected, accepted, declined, auto_added, completed, api_checks,
      revenue_usd, orders_with_revenue, combo_split, funnel_steps, funnel_types
    from analytics_daily
    where shop = ${shop}
      ${sinceDay ? db`and day >= ${sinceDay}::date` : db``}
      ${scope.testIds ? db`and test_id in ${db(scope.testIds)}` : db``}
  `;

  return mergeDailyRows(rows);
}

function mergeDailyRows(rows: DailyRow[]): DailyAggregate {
  const totals = emptyAggregate();
  const combos = new Map<string, DailyCombo>();
  const steps = new Map<string, number>();
  const types = new Map<string, DailyFunnelType>();
  const tests = new Map<string, DailyTestSummary>();

  for (const row of rows) {
    totals.shown += row.shown;
    totals.qualified += row.qualified;
    totals.rejected += row.rejected;
    totals.accepted += row.accepted;
    totals.declined += row.declined;
    totals.autoAdded += row.auto_added;
    totals.completed += row.completed;
    totals.apiChecks += row.api_checks;
    const revenue = Number(row.revenue_usd) || 0;
    totals.revenueUsd += revenue;
    totals.ordersWithRevenue += row.orders_with_revenue;

    if (row.test_id) {
      const current = tests.get(row.test_id) ?? {
        testId: row.test_id,
        shown: 0,
        converted: 0,
        revenueUsd: 0,
        ordersWithRevenue: 0,
      };
      current.shown += row.shown;
      current.converted += row.accepted;
      current.revenueUsd += revenue;
      current.ordersWithRevenue += row.orders_with_revenue;
      tests.set(row.test_id, current);
    }

    for (const combo of parseJson<DailyCombo>(row.combo_split)) {
      const current = combos.get(combo.variant) ?? {
        variant: combo.variant,
        shown: 0,
        converted: 0,
        declined: 0,
        completed: 0,
        qualified: 0,
      };
      current.shown += combo.shown;
      current.converted += combo.converted;
      current.declined += combo.declined;
      current.completed += combo.completed;
      current.qualified += combo.qualified ?? 0;
      combos.set(combo.variant, current);
    }

    for (const step of parseJson<DailyStep>(row.funnel_steps)) {
      steps.set(step.step, (steps.get(step.step) ?? 0) + step.count);
    }

    for (const type of parseJson<DailyFunnelType>(row.funnel_types)) {
      const current = types.get(type.funnelType) ?? {
        funnelType: type.funnelType,
        shown: 0,
        converted: 0,
        declined: 0,
        qualified: 0,
        rejected: 0,
      };
      current.shown += type.shown;
      current.converted += type.converted;
      current.declined += type.declined;
      current.qualified += type.qualified;
      current.rejected += type.rejected;
      types.set(type.funnelType, current);
    }
  }

  totals.comboSplit = [...combos.values()].sort((a, b) => b.shown - a.shown);
  totals.funnelSteps = [...steps.entries()]
    .map(([step, count]) => ({ step, count }))
    .sort((a, b) => b.count - a.count);
  totals.funnelTypes = [...types.values()].sort((a, b) => b.shown - a.shown);
  totals.byTest = [...tests.values()];
  return totals;
}
