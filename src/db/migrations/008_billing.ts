import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  // users → stripe_customer_id
  await db.schema
    .alterTable("users")
    .addColumn("stripe_customer_id", "text")
    .execute()


  // plans → stripe_price_id
  // Already created by migration 006 on fresh databases.
  await db.schema
    .alterTable("plans")
    .addColumn("stripe_price_id", "text", (col) =>
      col.ifNotExists()
    )
    .execute()


  // subscriptions → stripe_subscription_id
  await db.schema
    .alterTable("subscriptions")
    .addColumn("stripe_subscription_id", "text")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("subscriptions")
    .dropColumn("stripe_subscription_id")
    .execute()

  await db.schema
    .alterTable("users")
    .dropColumn("stripe_customer_id")
    .execute()
}