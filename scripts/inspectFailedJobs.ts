import "dotenv/config"
import { getMonitorQueue } from "../src/infra/queues.js"

async function main() {
  const queue = getMonitorQueue()

  const failed = await queue.getFailed()

  console.log("❌ Failed Jobs:", failed.length)

  for (const job of failed) {
    console.log({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
    })
  }

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})