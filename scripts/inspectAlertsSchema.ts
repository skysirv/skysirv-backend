import { sql } from "kysely"
import { db } from "../src/db/kysely.js"

async function main() {
  const result = await sql<{
    column_name: string
    data_type: string
    is_nullable: string
  }>`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'alerts'
    order by ordinal_position
  `.execute(db)

  console.table(result.rows)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})