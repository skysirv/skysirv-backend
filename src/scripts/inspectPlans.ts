import { db } from "../db/kysely.js"

async function main() {
  const plans = await db
    .selectFrom("plans")
    .selectAll()
    .execute()

  console.log("Plans in DB:")
  console.dir(plans, { depth: null })

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})