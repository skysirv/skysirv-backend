import { Kysely } from "kysely"
import { DB } from "../db/types.js"
import { Queue } from "bullmq"
import { BillingService } from "../services/billing.service.js"

declare module "fastify" {
  interface FastifyInstance {
    db: Kysely<DB>
    queue: Queue
    billingService: BillingService
    authenticate: any
  }

  interface FastifyRequest {
    user: {
      id: string
      email: string
    }
  }
}