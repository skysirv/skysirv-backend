import Fastify from "fastify"
import cors from "@fastify/cors"
import rateLimit from "@fastify/rate-limit"
import fastifyRawBody from "fastify-raw-body"

import { env } from "../config/env.js"
import { jwtPlugin } from "../auth/jwt.js"
import { authRoutes } from "../auth/routes.js"
import { watchlistRoutes } from "../routes/watchlist.js"
import { alertsRoutes } from "../routes/alerts.js"
import { billingRoutes } from "../routes/billing.js"
import { billingWebhookRoute } from "../routes/billing.webhook.js"
import { intelligenceRoutes } from "../routes/intelligence.js"
import { monitorRoutes } from "../routes/monitor.js"
import { explorerRoutes } from "../routes/explorer.js"
import { adminRoutes } from "../routes/admin.js"
import { inviteRoutes } from "../routes/invite.js"
import { subscriptionRoutes } from "../routes/subscriptions.js"
import { googleAuthRoutes } from "../auth/googleRoutes.js"

import { getMonitorQueue } from "../infra/queues.js"
import { db } from "../db/kysely.js"
import { BillingService } from "../services/billing.service.js"

export function buildServer() {
  const app = Fastify({
    logger: true,
  })

  app.register(cors, {
    origin: [
      "http://127.0.0.1:3000",
      "http://localhost:3000",
      "https://skysirv.com",
      "https://www.skysirv.com",
      "https://skysirv-frontend.vercel.app"
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })

  // Rate limiting
  app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  })

  /**
   * Raw body support (required for Stripe webhook signature verification)
   * Scoped only — not global.
   */
  app.register(fastifyRawBody, {
    field: "rawBody",
    global: false,
    encoding: false,
    runFirst: true,
  })

  // Auth
  app.register(jwtPlugin)

  // Attach DB
  app.decorate("db", db)

  // Attach monitor queue
  const monitorQueue = getMonitorQueue()
  app.decorate("queue", monitorQueue)

  // Attach billing service
  const billingService = new BillingService()
  app.decorate("billingService", billingService)

  /**
   * STRIPE WEBHOOK
   * Must be registered before body parsing routes
   */
  app.register(billingWebhookRoute)

  // Routes
  app.register(authRoutes)
  app.register(googleAuthRoutes)
  app.register(watchlistRoutes)
  app.register(alertsRoutes)
  app.register(billingRoutes)
  app.register(intelligenceRoutes)
  app.register(monitorRoutes)
  app.register(explorerRoutes)
  app.register(adminRoutes, { prefix: "/api" })
  app.register(inviteRoutes, { prefix: "/api" })
  app.register(subscriptionRoutes, { prefix: "/api" })

  // Health
  app.get("/health", async () => {
    return {
      ok: true,
      service: "skysirv-api",
      nodeEnv: env.NODE_ENV,
    }
  })

  return app
}