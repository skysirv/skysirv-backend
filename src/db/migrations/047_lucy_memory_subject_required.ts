import { Kysely } from "kysely"

export async function up(
  db: Kysely<any>
): Promise<void> {
  await db.schema
    .alterTable("user_lucy_memories")
    .dropConstraint(
      "user_lucy_memories_user_key_unique"
    )
    .execute()

  await db.schema
    .alterTable("user_lucy_memories")
    .alterColumn("subject_id", (col) =>
      col.setNotNull()
    )
    .execute()
}

export async function down(
  db: Kysely<any>
): Promise<void> {
  await db.schema
    .alterTable("user_lucy_memories")
    .alterColumn("subject_id", (col) =>
      col.dropNotNull()
    )
    .execute()

  await db.schema
    .alterTable("user_lucy_memories")
    .addUniqueConstraint(
      "user_lucy_memories_user_key_unique",
      [
        "user_id",
        "memory_type",
        "memory_key",
      ]
    )
    .execute()
}