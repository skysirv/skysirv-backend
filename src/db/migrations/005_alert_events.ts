import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('alert_events')
    .addColumn('id', 'uuid', col =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('alert_id', 'integer', col =>
      col.notNull().references('alerts.id').onDelete('cascade')
    )
    .addColumn('route_hash', 'varchar', col => col.notNull())
    .addColumn('trigger_price', 'numeric', col => col.notNull())
    .addColumn('triggered_at', 'timestamp', col =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute()

  await db.schema
    .createIndex('alert_events_unique_idx')
    .on('alert_events')
    .columns(['alert_id', 'trigger_price'])
    .unique()
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('alert_events').execute()
}