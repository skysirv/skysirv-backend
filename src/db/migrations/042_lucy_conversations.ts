import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("lucy_conversations")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("title", "text", (col) =>
      col.notNull().defaultTo("New conversation")
    )
    .addColumn("pinned", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn("status", "text", (col) =>
      col.notNull().defaultTo("active")
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .execute()

  await db.schema
    .createIndex("lucy_conversations_user_id_idx")
    .on("lucy_conversations")
    .column("user_id")
    .execute()

  await db.schema
    .createIndex("lucy_conversations_user_status_idx")
    .on("lucy_conversations")
    .columns(["user_id", "status"])
    .execute()

  await db.schema
    .createIndex("lucy_conversations_user_updated_idx")
    .on("lucy_conversations")
    .columns(["user_id", "updated_at"])
    .execute()

  await db.schema
    .createTable("lucy_conversation_messages")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("conversation_id", "uuid", (col) =>
      col
        .notNull()
        .references("lucy_conversations.id")
        .onDelete("cascade")
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("source", "text", (col) =>
      col.notNull().defaultTo("dashboard")
    )
    .addColumn("client_message_id", "text")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .addUniqueConstraint(
      "lucy_conversation_messages_conversation_client_unique",
      ["conversation_id", "client_message_id"]
    )
    .execute()

  await db.schema
    .createIndex("lucy_conversation_messages_conversation_idx")
    .on("lucy_conversation_messages")
    .column("conversation_id")
    .execute()

  await db.schema
    .createIndex("lucy_conversation_messages_conversation_created_idx")
    .on("lucy_conversation_messages")
    .columns(["conversation_id", "created_at"])
    .execute()

  await db.schema
    .createIndex("lucy_conversation_messages_user_idx")
    .on("lucy_conversation_messages")
    .column("user_id")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("lucy_conversation_messages_user_idx")
    .execute()

  await db.schema
    .dropIndex("lucy_conversation_messages_conversation_created_idx")
    .execute()

  await db.schema
    .dropIndex("lucy_conversation_messages_conversation_idx")
    .execute()

  await db.schema
    .dropTable("lucy_conversation_messages")
    .execute()

  await db.schema
    .dropIndex("lucy_conversations_user_updated_idx")
    .execute()

  await db.schema
    .dropIndex("lucy_conversations_user_status_idx")
    .execute()

  await db.schema
    .dropIndex("lucy_conversations_user_id_idx")
    .execute()

  await db.schema
    .dropTable("lucy_conversations")
    .execute()
}