import { db } from "../db/index.js"

async function seedPlans() {
  await db.insertInto("plans").values([
    {
      id: "free",
      name: "Free",
      max_watchlists: 3,
      max_alerts: 10,
      price_monthly: 0,
      stripe_price_id: null,
      created_at: new Date(),
    },
    {
      id: "pro_monthly",
      name: "Pro Monthly",
      max_watchlists: 25,
      max_alerts: 100,
      price_monthly: 29,
      stripe_price_id: "price_1T87j023AJ546dofyqIzTqEZ",
      created_at: new Date(),
    },
    {
      id: "pro_yearly",
      name: "Pro Yearly",
      max_watchlists: 25,
      max_alerts: 100,
      price_monthly: 290,
      stripe_price_id: "price_1T87k123AJ546doflJlcih0h",
      created_at: new Date(),
    },
    {
      id: "business_monthly",
      name: "Business Monthly",
      max_watchlists: 100,
      max_alerts: 500,
      price_monthly: 99,
      stripe_price_id: "price_1T87lZ23AJ546dofFXkye5uP",
      created_at: new Date(),
    },
    {
      id: "business_yearly",
      name: "Business Yearly",
      max_watchlists: 100,
      max_alerts: 500,
      price_monthly: 990,
      stripe_price_id: "price_1T87m423AJ546dofSp3Pkb7R",
      created_at: new Date(),
    },
  ]).execute()

  console.log("Plans seeded successfully")
  process.exit(0)
}

seedPlans().catch((err) => {
  console.error(err)
  process.exit(1)
})