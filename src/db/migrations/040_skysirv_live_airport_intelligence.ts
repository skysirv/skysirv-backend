import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("skysirv_live_airports")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("iata_code", "text", (col) => col.notNull().unique())
    .addColumn("icao_code", "text")
    .addColumn("faa_lid", "text")
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("city", "text", (col) => col.notNull())
    .addColumn("country", "text", (col) => col.notNull())
    .addColumn("country_code", "text", (col) => col.notNull())
    .addColumn("region", "text")
    .addColumn("subregion", "text")
    .addColumn("global_region", "text", (col) => col.notNull())
    .addColumn("airport_class", "text", (col) => col.notNull())
    .addColumn("latitude", "numeric", (col) => col.notNull())
    .addColumn("longitude", "numeric", (col) => col.notNull())
    .addColumn("timezone", "text")
    .addColumn("priority_rank", "integer", (col) => col.notNull().defaultTo(5))
    .addColumn("is_major_airport", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn("is_skysirv_live_enabled", "boolean", (col) =>
      col.notNull().defaultTo(true)
    )
    .addColumn("supports_faa", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn("supports_cirium", "boolean", (col) =>
      col.notNull().defaultTo(true)
    )
    .addColumn("supports_flightaware", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn("metadata_json", "jsonb")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .execute()

  await db.schema
    .createIndex("skysirv_live_airports_iata_code_idx")
    .on("skysirv_live_airports")
    .column("iata_code")
    .execute()

  await db.schema
    .createIndex("skysirv_live_airports_icao_code_idx")
    .on("skysirv_live_airports")
    .column("icao_code")
    .execute()

  await db.schema
    .createIndex("skysirv_live_airports_global_region_idx")
    .on("skysirv_live_airports")
    .column("global_region")
    .execute()

  await db.schema
    .createIndex("skysirv_live_airports_country_code_idx")
    .on("skysirv_live_airports")
    .column("country_code")
    .execute()

  await db.schema
    .createIndex("skysirv_live_airports_airport_class_idx")
    .on("skysirv_live_airports")
    .column("airport_class")
    .execute()

  await db.schema
    .createIndex("skysirv_live_airports_enabled_priority_idx")
    .on("skysirv_live_airports")
    .columns(["is_skysirv_live_enabled", "priority_rank"])
    .execute()

  await db.schema
    .createTable("skysirv_live_airport_snapshots")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("airport_id", "uuid", (col) =>
      col.notNull().references("skysirv_live_airports.id").onDelete("cascade")
    )
    .addColumn("iata_code", "text", (col) => col.notNull())
    .addColumn("icao_code", "text")
    .addColumn("pressure_score", "integer", (col) => col.notNull())
    .addColumn("severity", "text", (col) => col.notNull())
    .addColumn("status_label", "text", (col) => col.notNull())
    .addColumn("departure_pressure_percent", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("arrival_pressure_percent", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("cancellation_percent", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("average_departure_delay_minutes", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("average_arrival_delay_minutes", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("primary_reason", "text")
    .addColumn("active_sources", "jsonb", (col) => col.notNull())
    .addColumn("source_breakdown_json", "jsonb")
    .addColumn("provider_payload_json", "jsonb")
    .addColumn("weather_payload_json", "jsonb")
    .addColumn("snapshot_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .execute()

  await db.schema
    .createIndex("skysirv_live_airport_snapshots_airport_id_idx")
    .on("skysirv_live_airport_snapshots")
    .column("airport_id")
    .execute()

  await db.schema
    .createIndex("skysirv_live_airport_snapshots_iata_code_idx")
    .on("skysirv_live_airport_snapshots")
    .column("iata_code")
    .execute()

  await db.schema
    .createIndex("skysirv_live_airport_snapshots_snapshot_at_idx")
    .on("skysirv_live_airport_snapshots")
    .column("snapshot_at")
    .execute()

  await db.schema
    .createIndex("skysirv_live_airport_snapshots_iata_snapshot_idx")
    .on("skysirv_live_airport_snapshots")
    .columns(["iata_code", "snapshot_at"])
    .execute()

  await db.schema
    .createIndex("skysirv_live_airport_snapshots_severity_idx")
    .on("skysirv_live_airport_snapshots")
    .column("severity")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("skysirv_live_airport_snapshots_severity_idx")
    .execute()
  await db.schema
    .dropIndex("skysirv_live_airport_snapshots_iata_snapshot_idx")
    .execute()
  await db.schema
    .dropIndex("skysirv_live_airport_snapshots_snapshot_at_idx")
    .execute()
  await db.schema
    .dropIndex("skysirv_live_airport_snapshots_iata_code_idx")
    .execute()
  await db.schema
    .dropIndex("skysirv_live_airport_snapshots_airport_id_idx")
    .execute()
  await db.schema.dropTable("skysirv_live_airport_snapshots").execute()

  await db.schema
    .dropIndex("skysirv_live_airports_enabled_priority_idx")
    .execute()
  await db.schema
    .dropIndex("skysirv_live_airports_airport_class_idx")
    .execute()
  await db.schema
    .dropIndex("skysirv_live_airports_country_code_idx")
    .execute()
  await db.schema
    .dropIndex("skysirv_live_airports_global_region_idx")
    .execute()
  await db.schema.dropIndex("skysirv_live_airports_icao_code_idx").execute()
  await db.schema.dropIndex("skysirv_live_airports_iata_code_idx").execute()
  await db.schema.dropTable("skysirv_live_airports").execute()
}