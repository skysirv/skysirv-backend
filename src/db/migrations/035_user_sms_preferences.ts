import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("user_sms_preferences")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("phone_number", "text")
    .addColumn("phone_verified", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn("sms_enabled", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn("price_alerts_enabled", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn("watchlist_alerts_enabled", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn("system_alerts_enabled", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn("sms_opted_in_at", "timestamp")
    .addColumn("sms_opted_out_at", "timestamp")
    .addColumn("phone_verified_at", "timestamp")
    .addColumn("last_sms_sent_at", "timestamp")
    .addColumn("opt_out_reason", "text")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .addUniqueConstraint("user_sms_preferences_user_id_unique", ["user_id"])
    .execute()

  await db.schema
    .createIndex("user_sms_preferences_user_id_idx")
    .on("user_sms_preferences")
    .column("user_id")
    .execute()

  await db.schema
    .createIndex("user_sms_preferences_phone_number_idx")
    .on("user_sms_preferences")
    .column("phone_number")
    .execute()

  await db.schema
    .createTable("user_sms_events")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null")
    )
    .addColumn("phone_number", "text", (col) => col.notNull())
    .addColumn("event_type", "text", (col) => col.notNull())
    .addColumn("provider", "text", (col) => col.notNull().defaultTo("twilio"))
    .addColumn("provider_message_sid", "text")
    .addColumn("metadata_json", "jsonb")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .execute()

  await db.schema
    .createIndex("user_sms_events_user_id_idx")
    .on("user_sms_events")
    .column("user_id")
    .execute()

  await db.schema
    .createIndex("user_sms_events_phone_number_idx")
    .on("user_sms_events")
    .column("phone_number")
    .execute()

  await db.schema
    .createIndex("user_sms_events_created_at_idx")
    .on("user_sms_events")
    .column("created_at")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("user_sms_events_created_at_idx").execute()
  await db.schema.dropIndex("user_sms_events_phone_number_idx").execute()
  await db.schema.dropIndex("user_sms_events_user_id_idx").execute()
  await db.schema.dropTable("user_sms_events").execute()

  await db.schema.dropIndex("user_sms_preferences_phone_number_idx").execute()
  await db.schema.dropIndex("user_sms_preferences_user_id_idx").execute()
  await db.schema.dropTable("user_sms_preferences").execute()
}