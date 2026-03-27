import "dotenv/config"
import { seedPlans } from "./seedPlans.js"

async function run() {
  try {
    await seedPlans()
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

run()