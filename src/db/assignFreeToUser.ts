import "dotenv/config"
import { db } from "./index.js"

async function run() {
  try {
    const user = await db
      .selectFrom("users")
      .selectAll()
      .executeTakeFirst()

    if (!user) {
      console.log("❌ No users found.")
      process.exit(0)
    }

    await db
      .insertInto("subscriptions")
      .values({
        user_id: user.id,
        plan_id: "free",
        status: "active",
        current_period_end: null,
      })
      .onConflict((oc) => oc.column("user_id").doNothing())
      .execute()

    console.log(`✅ Assigned FREE plan to user: ${user.email}`)
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

run()