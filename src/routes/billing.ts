import { FastifyInstance } from "fastify"
import { stripe } from "../lib/stripeClient.js"
import { env } from "../config/env.js"

type CheckoutBody = {
  plan: "pro" | "enterprise"
  billing: "monthly" | "yearly"
}

export async function billingRoutes(app: FastifyInstance) {

  /**
   * Create Stripe Checkout Session
   * POST /billing/create-checkout-session
   */
  app.post(
    "/billing/create-checkout-session",
    { preHandler: app.authenticate },
    async (request, reply) => {

      try {

        const user = request.user as { id: string }

        if (!user.id) {
          return reply.status(401).send({ error: "Unauthorized" })
        }

        const userId = user.id

        const body = request.body as CheckoutBody

        if (!body?.plan || !body?.billing) {
          return reply.status(400).send({
            error: "Missing plan or billing type"
          })
        }

        /**
         * Plans in DB are stored like:
         * pro_monthly
         * pro_yearly
         * enterprise_monthly
         * enterprise_yearly
         */
        const planId = `${body.plan}_${body.billing}`

        const plan = await app.db
          .selectFrom("plans")
          .selectAll()
          .where("id", "=", planId)
          .executeTakeFirst()

        if (!plan) {
          return reply.status(500).send({
            error: "Plan not configured"
          })
        }

        if (!plan.stripe_price_id) {
          return reply.status(500).send({
            error: "Stripe price ID missing"
          })
        }

        const session = await stripe.checkout.sessions.create({
          mode: "subscription",

          line_items: [
            {
              price: plan.stripe_price_id,
              quantity: 1,
            },
          ],

          success_url: env.STRIPE_SUCCESS_URL,
          cancel_url: env.STRIPE_CANCEL_URL,

          metadata: {
            userId,
            planId
          },
        })

        return {
          url: session.url
        }

      } catch (err) {
        request.log.error(err)
        return reply.status(500).send({
          error: "Checkout session creation failed"
        })
      }

    }
  )
}