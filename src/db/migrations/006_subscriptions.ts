import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("plans")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("max_watchlists", "integer", (col) => col.notNull())
    .addColumn("max_alerts", "integer", (col) => col.notNull())
    .addColumn("price_monthly", "numeric", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull()
    )
    .execute();

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

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("subscriptions_user_status_idx").execute();
  await db.schema.dropTable("subscriptions").execute();
  await db.schema.dropTable("plans").execute();
}