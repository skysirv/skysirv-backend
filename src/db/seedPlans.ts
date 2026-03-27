import { db } from "./index.js"

export async function seedPlans() {
  await db
    .insertInto("plans")
    .values([
      {
        id: "free",
        name: "Free",
        max_watchlists: 1,
        max_alerts: 1,
        price_monthly: 0,
        created_at: new Date()
      },
      {
        id: "pro",
        name: "Pro",
        max_watchlists: 25,
        max_alerts: 100,
        price_monthly: 29,
        created_at: new Date()
      }
    ])
    .onConflict((oc) => oc.column("id").doNothing())
    .execute()

  console.log("✅ Plans seeded")
}