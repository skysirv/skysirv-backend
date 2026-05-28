import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("user_lucy_memories")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("memory_type", "text", (col) => col.notNull())
    .addColumn("memory_key", "text", (col) => col.notNull())
    .addColumn("memory_text", "text", (col) => col.notNull())
    .addColumn("memory_value_json", "jsonb")
    .addColumn("confidence", "text", (col) =>
      col.notNull().defaultTo("confirmed")
    )
    .addColumn("source", "text", (col) =>
      col.notNull().defaultTo("user_confirmed")
    )
    .addColumn("status", "text", (col) =>
      col.notNull().defaultTo("active")
    )
    .addColumn("last_used_at", "timestamp")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .addUniqueConstraint("user_lucy_memories_user_key_unique", [
      "user_id",
      "memory_type",
      "memory_key",
    ])
    .execute()

  await db.schema
    .createIndex("user_lucy_memories_user_id_idx")
    .on("user_lucy_memories")
    .column("user_id")
    .execute()

  await db.schema
    .createIndex("user_lucy_memories_user_status_idx")
    .on("user_lucy_memories")
    .columns(["user_id", "status"])
    .execute()

  await db.schema
    .createIndex("user_lucy_memories_user_type_idx")
    .on("user_lucy_memories")
    .columns(["user_id", "memory_type"])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("user_lucy_memories_user_type_idx").execute()
  await db.schema.dropIndex("user_lucy_memories_user_status_idx").execute()
  await db.schema.dropIndex("user_lucy_memories_user_id_idx").execute()
  await db.schema.dropTable("user_lucy_memories").execute()
}