import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("public_sms_subscribers")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("visitor_id", "text", (col) => col.notNull())
    .addColumn("phone_number", "text")
    .addColumn("sms_enabled", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn("price_alerts_enabled", "boolean", (col) =>
      col.notNull().defaultTo(true)
    )
    .addColumn("watchlist_alerts_enabled", "boolean", (col) =>
      col.notNull().defaultTo(true)
    )
    .addColumn("system_alerts_enabled", "boolean", (col) =>
      col.notNull().defaultTo(true)
    )
    .addColumn("source_page", "text", (col) =>
      col.notNull().defaultTo("homepage")
    )
    .addColumn("ip_hash", "text")
    .addColumn("user_agent_hash", "text")
    .addColumn("sms_opted_in_at", "timestamp")
    .addColumn("sms_dismissed_at", "timestamp")
    .addColumn("sms_opted_out_at", "timestamp")
    .addColumn("last_seen_at", "timestamp")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .addUniqueConstraint("public_sms_subscribers_visitor_id_unique", [
      "visitor_id",
    ])
    .execute()

  await db.schema
    .createIndex("public_sms_subscribers_visitor_id_idx")
    .on("public_sms_subscribers")
    .column("visitor_id")
    .execute()

  await db.schema
    .createIndex("public_sms_subscribers_phone_number_idx")
    .on("public_sms_subscribers")
    .column("phone_number")
    .execute()

  await db.schema
    .createIndex("public_sms_subscribers_ip_hash_idx")
    .on("public_sms_subscribers")
    .column("ip_hash")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("public_sms_subscribers_ip_hash_idx").execute()
  await db.schema.dropIndex("public_sms_subscribers_phone_number_idx").execute()
  await db.schema.dropIndex("public_sms_subscribers_visitor_id_idx").execute()
  await db.schema.dropTable("public_sms_subscribers").execute()
}