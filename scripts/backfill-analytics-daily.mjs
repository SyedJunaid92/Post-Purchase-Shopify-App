import fs from "fs";
import postgres from "postgres";

function databaseUrl() {
  const raw = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^DATABASE_URL=(.*)$/);
    if (!match) continue;
    return match[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("DATABASE_URL is missing");
}

function addUtcDays(day, days) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayString(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

const sql = postgres(databaseUrl(), {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
});

async function ensureTables() {
  await sql.unsafe(`
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
    )
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS analytics_daily_shop_day_idx
      ON analytics_daily (shop, day DESC)
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS analytics_rollup_state (
      shop text PRIMARY KEY,
      oldest_filled date
    )
  `);
}

async function rebuildShopDay(shop, day) {
  const end = addUtcDays(day, 1);
  return sql.begin(async (tx) => {
    await tx`select set_config('statement_timeout', '60000', true)`;
    await tx`
      delete from analytics_daily
      where shop = ${shop} and day = ${day}::date
    `;
    const inserted = await tx`
      with real_events as (
        select *
        from analytics_events
        where shop = ${shop}
          and created_at >= ${day}::timestamptz
          and created_at < ${end}::timestamptz
          and length(coalesce(reference_id, '')) >= 12
          and coalesce(reference_id, '') !~ '^test'
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
              when coalesce(event_data->>'amountUsd', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                then (event_data->>'amountUsd')::numeric
              when upper(coalesce(event_data->>'currency', 'USD')) = 'USD'
               and coalesce(event_data->>'amount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                then (event_data->>'amount')::numeric
              else 0
            end as amount_usd
          from real_events
          where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
          order by reference_id, created_at desc
        ) orders
        group by 1
      ),
      combo as (
        select test_key,
          coalesce(jsonb_agg(jsonb_build_object(
            'variant', variant, 'shown', shown, 'converted', converted,
            'declined', declined, 'completed', completed, 'qualified', qualified
          ) order by shown desc), '[]'::jsonb) as combo_split
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
        select test_key,
          coalesce(jsonb_agg(jsonb_build_object('step', step, 'count', step_count) order by step_count desc), '[]'::jsonb) as funnel_steps
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
        select test_key,
          coalesce(jsonb_agg(jsonb_build_object(
            'funnelType', funnel_type, 'shown', shown, 'converted', converted,
            'declined', declined, 'qualified', qualified, 'rejected', rejected
          ) order by shown desc), '[]'::jsonb) as funnel_types
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
        ${shop}, ${day}::date, base.test_key, base.test_id,
        base.shown, base.qualified, base.rejected, base.accepted, base.declined,
        base.auto_added, base.completed, base.api_checks,
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

async function main() {
  await ensureTables();
  await sql`select set_config('statement_timeout', '120000', false)`;

  const pairs = await sql`
    select shop, (created_at at time zone 'utc')::date as day
    from analytics_events
    group by 1, 2
    order by 1, 2
  `;
  console.log(`shop-days to rebuild: ${pairs.length}`);

  let done = 0;
  for (const row of pairs) {
    const day = dayString(row.day);
    const count = await rebuildShopDay(row.shop, day);
    done += 1;
    if (done === 1 || done % 10 === 0 || done === pairs.length) {
      console.log(`rebuilt ${done}/${pairs.length} ${row.shop} ${day} rows=${count}`);
    }
  }

  const totals = await sql`
    select
      shop,
      count(*)::int as daily_rows,
      min(day) as first_day,
      max(day) as last_day,
      coalesce(sum(shown), 0)::int as shown,
      coalesce(sum(qualified), 0)::int as qualified,
      coalesce(sum(rejected), 0)::int as rejected,
      coalesce(sum(accepted), 0)::int as accepted,
      coalesce(sum(declined), 0)::int as declined,
      coalesce(sum(auto_added), 0)::int as auto_added,
      coalesce(sum(completed), 0)::int as completed,
      coalesce(sum(api_checks), 0)::int as api_checks,
      coalesce(sum(revenue_usd), 0)::numeric(14,2) as revenue_usd,
      coalesce(sum(orders_with_revenue), 0)::int as orders_with_revenue
    from analytics_daily
    group by shop
    order by shop
  `;

  const byTest = await sql`
    select
      d.shop,
      coalesce(t.name, d.test_id::text, '(no funnel)') as funnel,
      coalesce(sum(d.shown), 0)::int as shown,
      coalesce(sum(d.accepted), 0)::int as converted,
      coalesce(sum(d.revenue_usd), 0)::numeric(14,2) as revenue_usd
    from analytics_daily d
    left join tests t on t.id = d.test_id
    group by d.shop, funnel
    order by d.shop, shown desc
  `;

  await sql`
    insert into analytics_rollup_state (shop, oldest_filled)
    select shop, min(day)
    from analytics_daily
    group by shop
    on conflict (shop) do update
      set oldest_filled = least(analytics_rollup_state.oldest_filled, excluded.oldest_filled)
  `;

  console.log("\nDAILY TABLE TOTALS");
  console.log(JSON.stringify(totals, null, 2));
  console.log("\nDAILY TABLE BY FUNNEL");
  console.log(JSON.stringify(byTest, null, 2));

  try {
    await sql`select set_config('statement_timeout', '120000', false)`;
    const raw = await sql`
      select
        shop,
        count(distinct reference_id) filter (
          where event_type = 'test_shown'
            and length(coalesce(reference_id, '')) >= 12
            and coalesce(reference_id, '') !~ '^test'
        )::int as shown,
        count(distinct reference_id) filter (
          where event_type = 'qualified'
            and length(coalesce(reference_id, '')) >= 12
            and coalesce(reference_id, '') !~ '^test'
        )::int as qualified,
        count(distinct reference_id) filter (
          where event_type = 'rejected'
            and length(coalesce(reference_id, '')) >= 12
            and coalesce(reference_id, '') !~ '^test'
        )::int as rejected,
        count(distinct reference_id) filter (
          where event_type in ('offer_accepted', 'trial_started', 'product_auto_added')
            and length(coalesce(reference_id, '')) >= 12
            and coalesce(reference_id, '') !~ '^test'
        )::int as accepted,
        count(distinct reference_id) filter (
          where event_type = 'offer_declined'
            and length(coalesce(reference_id, '')) >= 12
            and coalesce(reference_id, '') !~ '^test'
        )::int as declined,
        count(distinct reference_id) filter (
          where event_type = 'test_completed'
            and length(coalesce(reference_id, '')) >= 12
            and coalesce(reference_id, '') !~ '^test'
        )::int as completed
      from analytics_events
      group by shop
      order by shop
    `;
    console.log("\nCURRENT RAW EVENT TOTALS (what the live page calculates)");
    console.log(JSON.stringify(raw, null, 2));
  } catch (error) {
    console.log("\nCURRENT RAW EVENT TOTALS failed");
    console.log(error instanceof Error ? error.message : String(error));
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
