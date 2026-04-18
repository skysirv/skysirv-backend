import { Kysely, sql } from "kysely"
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("plans")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("max_watchlists", "integer", (col) => col.notNull())
    .addColumn("max_alerts", "integer", (col) => col.notNull())
    .addColumn("price_monthly", "numeric", (col) => col.notNull())
    .addColumn("stripe_price_id", "text") // ✅ ADD THIS
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull()
    )
    .execute();

  // ✅ SEED PLANS (PRODUCTION GRADE)
  await db.insertInto("plans").values([
    {
      id: "free",
      name: "Free",
      max_watchlists: 3,
      max_alerts: 10,
      price_monthly: 0,
      stripe_price_id: null
    },
    {
      id: "pro_monthly",
      name: "Pro Monthly",
      max_watchlists: 25,
      max_alerts: 100,
      price_monthly: 29,
      stripe_price_id: "price_1T87jO23AJ546dofyqIzTqEZ"
    },
    {
      id: "pro_yearly",
      name: "Pro Yearly",
      max_watchlists: 25,
      max_alerts: 100,
      price_monthly: 290,
      stripe_price_id: "price_1T87k123AJ546doflJlcIh0h"
    },
    {
      id: "business_monthly",
      name: "Business Monthly",
      max_watchlists: 100,
      max_alerts: 500,
      price_monthly: 99,
      stripe_price_id: "price_1T87lZ23AJ546dofFXkye5uP"
    },
    {
      id: "business_yearly",
      name: "Business Yearly",
      max_watchlists: 100,
      max_alerts: 500,
      price_monthly: 990,
      stripe_price_id: "price_1T87m423AJ546dofSp3Pkb7R"
    }
  ]).execute();

  await db.schema
    .createTable("subscriptions")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("plan_id", "text", (col) =>
      col.notNull().references("plans.id")
    )
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("current_period_end", "timestamp")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull()
    )
    .execute();

  await db.schema
    .createIndex("subscriptions_user_status_idx")
    .on("subscriptions")
    .columns(["user_id", "status"])
    .execute();
}