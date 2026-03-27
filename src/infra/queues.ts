import { Queue } from "bullmq"
import { env } from "../config/env.js"

export const QUEUE_NAMES = {
  monitor: "monitor-route",
  sendEmail: "send-alert-email",
} as const

function redisConnection() {
  return { url: env.REDIS_URL }
}

let monitorQueue: Queue | null = null
let emailQueue: Queue | null = null

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,

  backoff: {
    type: "exponential" as const,
    delay: 5000,
  },

  timeout: 60000,

  removeOnComplete: 1000,
  removeOnFail: 5000,
}

export function getMonitorQueue(): Queue {
  if (monitorQueue) return monitorQueue

  monitorQueue = new Queue(QUEUE_NAMES.monitor, {
    connection: redisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })

  return monitorQueue
}

export function getEmailQueue(): Queue {
  if (emailQueue) return emailQueue

  emailQueue = new Queue(QUEUE_NAMES.sendEmail, {
    connection: redisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })

  return emailQueue
}