import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("subscriptions")
    .addColumn("cancel_at_period_end", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .execute()

  await db.schema
    .alterTable("subscriptions")
    .addColumn("cancel_at", "timestamp")
    .execute()

  await db.schema
    .alterTable("subscriptions")
    .addColumn("canceled_at", "timestamp")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("subscriptions")
    .dropColumn("canceled_at")
    .execute()

  await db.schema
    .alterTable("subscriptions")
    .dropColumn("cancel_at")
    .execute()

  await db.schema
    .alterTable("subscriptions")
    .dropColumn("cancel_at_period_end")
    .execute()
}