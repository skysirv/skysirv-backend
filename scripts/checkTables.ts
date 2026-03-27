import { sql } from "kysely"
import { db } from "../src/db/kysely.js"

async function main() {
  const result = await sql<{ table_name: string }>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `.execute(db)

  console.log("Tables in public schema:")
  for (const row of result.rows) console.log("-", row.table_name)

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})