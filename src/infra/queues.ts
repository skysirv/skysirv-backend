import { Queue } from "bullmq"
import { env } from "../config/env.js"

export const QUEUE_NAMES = {
  monitor: "monitor-route",
  sendEmail: "send-alert-email",
} as const

let monitorQueue: Queue | null = null
let emailQueue: Queue | null = null
let warnedAboutDisabledLocalQueues = false

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

function redisConnection() {
  return {
    url: env.REDIS_URL,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  }
}

function shouldDisableQueuesForLocalDevelopment() {
  if (env.NODE_ENV !== "development") {
    return false
  }

  try {
    const redisUrl = new URL(env.REDIS_URL)
    return redisUrl.hostname.endsWith(".railway.internal")
  } catch {
    return false
  }
}

function warnAboutDisabledLocalQueues() {
  if (warnedAboutDisabledLocalQueues) {
    return
  }

  warnedAboutDisabledLocalQueues = true

  console.warn(
    "⚠️ Redis queues are disabled locally because REDIS_URL points to Railway private networking. Use a local Redis URL if you need queue jobs in development.",
  )
}

function createDisabledQueue(queueName: string): Queue {
  warnAboutDisabledLocalQueues()

  return {
    name: queueName,

    add: async () => {
      throw new Error(
        `Queue "${queueName}" is disabled in local development because REDIS_URL points to Railway private networking.`,
      )
    },

    close: async () => undefined,
    disconnect: async () => undefined,
  } as unknown as Queue
}

function createQueue(queueName: string) {
  if (shouldDisableQueuesForLocalDevelopment()) {
    return createDisabledQueue(queueName)
  }

  return new Queue(queueName, {
    connection: redisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })
}

export function getMonitorQueue(): Queue {
  if (monitorQueue) return monitorQueue

  monitorQueue = createQueue(QUEUE_NAMES.monitor)

  return monitorQueue
}

export function getEmailQueue(): Queue {
  if (emailQueue) return emailQueue

  emailQueue = createQueue(QUEUE_NAMES.sendEmail)

  return emailQueue
}