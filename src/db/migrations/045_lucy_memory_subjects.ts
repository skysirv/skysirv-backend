import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("user_lucy_memory_subjects")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey()
    )
    .addColumn("user_id", "uuid", (col) =>
      col
        .notNull()
        .references("users.id")
        .onDelete("cascade")
    )
    .addColumn("subject_type", "text", (col) =>
      col.notNull().defaultTo("person")
    )
    .addColumn("subject_key", "text", (col) =>
      col.notNull()
    )
    .addColumn("display_name", "text", (col) =>
      col.notNull()
    )
    .addColumn("relationship_label", "text")
    .addColumn("aliases", "jsonb", (col) =>
      col
        .notNull()
        .defaultTo(sql`'[]'::jsonb`)
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
    .addUniqueConstraint(
      "user_lucy_memory_subjects_user_subject_unique",
      [
        "user_id",
        "subject_type",
        "subject_key",
      ]
    )
    .execute()

  await db.schema
    .createIndex(
      "user_lucy_memory_subjects_user_idx"
    )
    .on("user_lucy_memory_subjects")
    .column("user_id")
    .execute()

  await db.schema
    .createIndex(
      "user_lucy_memory_subjects_user_status_idx"
    )
    .on("user_lucy_memory_subjects")
    .columns(["user_id", "status"])
    .execute()

  await db.schema
    .alterTable("user_lucy_memories")
    .addColumn("subject_id", "uuid", (col) =>
      col
        .references("user_lucy_memory_subjects.id")
        .onDelete("cascade")
    )
    .execute()

  await sql`
    insert into user_lucy_memory_subjects (
      id,
      user_id,
      subject_type,
      subject_key,
      display_name,
      relationship_label,
      aliases,
      status,
      created_at,
      updated_at
    )
    select
      gen_random_uuid(),
      users.id,
      'self',
      'self',
      coalesce(
        nullif(trim(users.first_name), ''),
        'Traveler'
      ),
      'self',
      '["self", "me"]'::jsonb,
      'active',
      now(),
      now()
    from users
    where exists (
      select 1
      from user_lucy_memories
      where user_lucy_memories.user_id = users.id
    )
    on conflict (
      user_id,
      subject_type,
      subject_key
    ) do nothing
  `.execute(db)

  await sql`
    update user_lucy_memories
    set subject_id =
      user_lucy_memory_subjects.id
    from user_lucy_memory_subjects
    where
      user_lucy_memory_subjects.user_id =
        user_lucy_memories.user_id
      and user_lucy_memory_subjects.subject_type =
        'self'
      and user_lucy_memory_subjects.subject_key =
        'self'
      and user_lucy_memories.subject_id is null
  `.execute(db)

  await db.schema
    .createIndex(
      "user_lucy_memories_subject_idx"
    )
    .on("user_lucy_memories")
    .column("subject_id")
    .execute()
}

export async function down(
  db: Kysely<any>
): Promise<void> {
  await db.schema
    .dropIndex(
      "user_lucy_memories_subject_idx"
    )
    .execute()

  await db.schema
    .alterTable("user_lucy_memories")
    .dropColumn("subject_id")
    .execute()

  await db.schema
    .dropIndex(
      "user_lucy_memory_subjects_user_status_idx"
    )
    .execute()

  await db.schema
    .dropIndex(
      "user_lucy_memory_subjects_user_idx"
    )
    .execute()

  await db.schema
    .dropTable("user_lucy_memory_subjects")
    .execute()
}