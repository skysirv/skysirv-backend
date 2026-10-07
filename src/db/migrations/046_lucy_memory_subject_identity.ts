import { Kysely } from "kysely"

export async function up(
  db: Kysely<any>
): Promise<void> {
  await db.schema
    .alterTable("user_lucy_memories")
    .addUniqueConstraint(
      "user_lucy_memories_user_subject_key_unique",
      [
        "user_id",
        "subject_id",
        "memory_type",
        "memory_key",
      ]
    )
    .execute()
}

export async function down(
  db: Kysely<any>
): Promise<void> {
  await db.schema
    .alterTable("user_lucy_memories")
    .dropConstraint(
      "user_lucy_memories_user_subject_key_unique"
    )
    .execute()
}