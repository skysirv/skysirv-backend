import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // ================= TRIPS =================
  await db.schema
    .createTable("trips")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("title", "text")
    .addColumn("booking_reference", "text")
    .addColumn("trip_type", "text", (col) => col.notNull())
    .addColumn("started_at", "timestamptz")
    .addColumn("ended_at", "timestamptz")
    .addColumn("origin_airport_code", "text")
    .addColumn("destination_airport_code", "text")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.defaultTo("now()").notNull()
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.defaultTo("now()").notNull()
    )
    .execute();

  // ================= TRIP SEGMENTS =================
  await db.schema
    .createTable("trip_segments")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("trip_id", "text", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("segment_order", "integer", (col) => col.notNull())

    .addColumn("airline_code", "text")
    .addColumn("flight_number", "text")

    .addColumn("departure_airport_code", "text", (col) => col.notNull())
    .addColumn("departure_terminal", "text")
    .addColumn("departure_gate", "text")
    .addColumn("scheduled_departure_at", "timestamptz")
    .addColumn("actual_departure_at", "timestamptz")

    .addColumn("arrival_airport_code", "text", (col) => col.notNull())
    .addColumn("arrival_terminal", "text")
    .addColumn("arrival_gate", "text")
    .addColumn("scheduled_arrival_at", "timestamptz")
    .addColumn("actual_arrival_at", "timestamptz")

    .addColumn("cabin_class", "text")
    .addColumn("fare_class", "text")
    .addColumn("aircraft_type", "text")
    .addColumn("distance_km", "integer")

    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("source", "text")

    .addColumn("created_at", "timestamptz", (col) =>
      col.defaultTo("now()").notNull()
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.defaultTo("now()").notNull()
    )
    .execute();

  // ================= USER INTELLIGENCE WRAPPED =================
  await db.schema
    .createTable("user_intelligence_wrapped")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("year", "integer", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())

    .addColumn("flights", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("countries", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("distance_km", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("skyscore_avg", "integer")

    .addColumn("savings_total", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("avg_savings", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("beat_market_pct", "integer", (col) =>
      col.notNull().defaultTo(0)
    )

    .addColumn("routes_monitored", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("alerts_triggered", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("alerts_won", "integer", (col) =>
      col.notNull().defaultTo(0)
    )

    .addColumn("traveler_identity", "text")
    .addColumn("wrapped_payload_json", "jsonb")

    .addColumn("generated_at", "timestamptz")

    .addColumn("created_at", "timestamptz", (col) =>
      col.defaultTo("now()").notNull()
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.defaultTo("now()").notNull()
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("user_intelligence_wrapped").execute();
  await db.schema.dropTable("trip_segments").execute();
  await db.schema.dropTable("trips").execute();
}