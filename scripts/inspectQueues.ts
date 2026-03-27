import "dotenv/config"
import { Queue } from "bullmq"
import { env } from "../src/config/env.js"
import { QUEUE_NAMES } from "../src/infra/queues.js"

async function inspectQueue(name: string) {
  const queue = new Queue(name, {
    connection: { url: env.REDIS_URL },
  })

  const counts = await queue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused"
  )

  console.log(`\n📦 Queue: ${name}`)
  console.log(counts)

  const failed = await queue.getFailed()
  if (failed.length > 0) {
    console.log("❌ Failed Jobs:")
    for (const job of failed) {
      console.log({
        id: job.id,
        name: job.name,
        failedReason: job.failedReason,
        data: job.data,
      })
    }
  }

  await queue.close()
}

async function main() {
  console.log("🔎 Inspecting queues...\n")

  await inspectQueue(QUEUE_NAMES.monitor)
  await inspectQueue(QUEUE_NAMES.sendEmail)

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})