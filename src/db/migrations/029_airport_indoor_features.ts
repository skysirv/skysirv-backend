import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("airport_indoor_features")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("airport_code", "text", (col) => col.notNull())
    .addColumn("mapbox_feature_id", "text")
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("normalized_name", "text", (col) => col.notNull())
    .addColumn("type", "text")
    .addColumn("class", "text")
    .addColumn("floor_id", "text")
    .addColumn("longitude", "double precision", (col) => col.notNull())
    .addColumn("latitude", "double precision", (col) => col.notNull())
    .addColumn("source", "text", (col) => col.notNull().defaultTo("mapbox"))
    .addColumn("raw_feature_json", "jsonb")
    .addColumn("last_seen_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute()

  await db.schema
    .createIndex("airport_indoor_features_airport_code_idx")
    .on("airport_indoor_features")
    .column("airport_code")
    .execute()

  await db.schema
    .createIndex("airport_indoor_features_airport_search_idx")
    .on("airport_indoor_features")
    .columns(["airport_code", "normalized_name"])
    .execute()

  await db.schema
    .createIndex("airport_indoor_features_airport_type_idx")
    .on("airport_indoor_features")
    .columns(["airport_code", "type"])
    .execute()

  await sql`
    CREATE UNIQUE INDEX airport_indoor_features_unique_feature_idx
    ON airport_indoor_features (
      airport_code,
      normalized_name,
      COALESCE(type, ''),
      COALESCE(class, ''),
      COALESCE(floor_id, ''),
      longitude,
      latitude
    )
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS airport_indoor_features_unique_feature_idx
  `.execute(db)

  await db.schema.dropIndex("airport_indoor_features_airport_type_idx").execute()
  await db.schema.dropIndex("airport_indoor_features_airport_search_idx").execute()
  await db.schema.dropIndex("airport_indoor_features_airport_code_idx").execute()

  await db.schema.dropTable("airport_indoor_features").execute()
}