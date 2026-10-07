import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("user_lucy_memories")
    .addColumn("channel", "text", (col) =>
      col.notNull().defaultTo("unknown")
    )
    .addColumn("source_conversation_id", "uuid", (col) =>
      col
        .references("lucy_conversations.id")
        .onDelete("set null")
    )
    .addColumn("source_message_id", "uuid", (col) =>
      col
        .references("lucy_conversation_messages.id")
        .onDelete("set null")
    )
    .addColumn("reinforcement_count", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("last_reinforced_at", "timestamp")
    .addColumn("usage_count", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .execute()

  await db.schema
    .createIndex(
      "user_lucy_memories_source_conversation_idx"
    )
    .on("user_lucy_memories")
    .column("source_conversation_id")
    .execute()

  await db.schema
    .createIndex(
      "user_lucy_memories_source_message_idx"
    )
    .on("user_lucy_memories")
    .column("source_message_id")
    .execute()
}

export async function down(
  db: Kysely<any>
): Promise<void> {
  await db.schema
    .dropIndex(
      "user_lucy_memories_source_message_idx"
    )
    .execute()

  await db.schema
    .dropIndex(
      "user_lucy_memories_source_conversation_idx"
    )
    .execute()

  await db.schema
    .alterTable("user_lucy_memories")
    .dropColumn("usage_count")
    .dropColumn("last_reinforced_at")
    .dropColumn("reinforcement_count")
    .dropColumn("source_message_id")
    .dropColumn("source_conversation_id")
    .dropColumn("channel")
    .execute()
}