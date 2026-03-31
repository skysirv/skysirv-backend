import { FastifyInstance } from "fastify"
import { logAdminActivity } from "../services/adminActivity.js"

export async function subscriptionRoutes(app: FastifyInstance) {
  /**
   * CREATE SUBSCRIPTION
   * Supports:
   * - free
   * - pro monthly
   * - pro yearly
   * - enterprise monthly
   * - enterprise yearly
   */
  app.post(
    "/subscriptions/create",
    {
      preHandler: [app.authenticate]
    },
    async (request, reply) => {
      const user = request.user as {
        id: string
        email: string
      }

      const body = request.body as {
        plan?: string
        billing_interval?: string | null
      }

      const plan = body.plan || "free"
      const billingInterval = body.billing_interval ?? null

      if (!["free", "pro", "enterprise"].includes(plan)) {
        reply.code(400)
        return { error: "Invalid plan" }
      }

      if (plan === "free" && billingInterval !== null) {
        reply.code(400)
        return { error: "Free plan cannot have a billing interval" }
      }

      if (
        (plan === "pro" || plan === "enterprise") &&
        !["monthly", "yearly"].includes(billingInterval || "")
      ) {
        reply.code(400)
        return { error: "Paid plans require billing_interval of monthly or yearly" }
      }

      const existing = await app.db
        .selectFrom("subscriptions")
        .select("id")
        .where("user_id", "=", user.id)
        .executeTakeFirst()

      if (existing) {
        reply.code(400)
        return { error: "Subscription already exists" }
      }

      const subscription = await app.db
        .insertInto("subscriptions")
        .values({
          user_id: user.id,
          plan_id: plan,
          status: "active",
          billing_interval: billingInterval
        })
        .returningAll()
        .executeTakeFirst()

      if (plan === "free") {
        await logAdminActivity(app.db, `Free plan selected: ${user.email}`)
      }

      return {
        success: true,
        subscription
      }
    }
  )

  /**
   * GET CURRENT SUBSCRIPTION
   * (used by dashboard)
   */
  app.get(
    "/subscriptions/me",
    {
      preHandler: [app.authenticate]
    },
    async (request) => {
      const user = request.user as {
        id: string
        email: string
      }

      const subscription = await app.db
        .selectFrom("subscriptions")
        .selectAll()
        .where("user_id", "=", user.id)
        .where("status", "=", "active")
        .executeTakeFirst()

      const planId = subscription?.plan_id ?? "free"

      const plan = await app.db
        .selectFrom("plans")
        .selectAll()
        .where("id", "=", planId)
        .executeTakeFirst()

      const watchlistCount = await app.db
        .selectFrom("watchlist")
        .select((eb) => eb.fn.count("id").as("count"))
        .where("user_id", "=", user.id)
        .executeTakeFirst()

      return {
        plan: planId,
        billing_interval: subscription?.billing_interval ?? null,
        status: subscription?.status ?? "free",
        routes_used: Number(watchlistCount?.count ?? 0),
        route_limit: plan?.max_watchlists ?? 3,
        current_period_end: subscription?.current_period_end ?? null
      }
    }
  )
}