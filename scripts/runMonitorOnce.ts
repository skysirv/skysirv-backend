import "dotenv/config"
import { db } from "../src/db/index.js"
import { getMonitorQueue, QUEUE_NAMES } from "../src/infra/queues.js"

async function main() {
  const routeHash =
    "3f4316552d1c52314aa764a20b1dd54ec2309c7e76bb848871da776a7758c056"

  const watchlistEntry = await db
    .selectFrom("watchlist")
    .selectAll()
    .where("route_hash", "=", routeHash)
    .limit(1)
    .executeTakeFirst()

  if (!watchlistEntry) {
    console.error("❌ No watchlist entry found for routeHash:", routeHash)
    process.exit(1)
  }

  const queue = getMonitorQueue()

  // IMPORTANT:
  // Queue name = "monitor-route" (QUEUE_NAMES.monitor)
  // Job name can be anything, but we’ll keep it consistent.
  const job = await queue.add(QUEUE_NAMES.monitor, {
    routeHash,
    origin: watchlistEntry.origin,
    destination: watchlistEntry.destination,
    departureDate: watchlistEntry.departure_date, // can be Date
  })

  const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed")

  console.log("🚀 Monitor job enqueued", {
    queueName: QUEUE_NAMES.monitor,
    jobName: job.name,
    jobId: job.id,
    counts,
  })

  process.exit(0)
}

main().catch((err) => {
  console.error("❌ runMonitorOnce failed:", err)
  process.exit(1)
})