import { FastifyInstance } from "fastify"
import Stripe from "stripe"

import { env } from "../config/env.js"
import { stripe } from "../lib/stripeClient.js"

export async function billingWebhookRoute(app: FastifyInstance) {
  app.post(
    "/billing/webhook",
    {
      config: {
        rawBody: true, // required for Stripe signature verification
      },
    },
    async (request, reply) => {
      const signature = request.headers["stripe-signature"]

      if (!signature) {
        request.log.error("Missing Stripe signature header")
        return reply.status(400).send({ error: "Missing signature" })
      }

      let event: Stripe.Event

      try {
        event = stripe.webhooks.constructEvent(
          request.rawBody as Buffer,
          signature,
          env.STRIPE_WEBHOOK_SECRET
        )
      } catch (err: any) {
        request.log.error({ err }, "Stripe signature verification failed")
        return reply.status(400).send({ error: "Invalid signature" })
      }

      request.log.info(
        {
          eventId: event.id,
          eventType: event.type,
        },
        "Stripe webhook received"
      )

      try {
        await app.db.transaction().execute(async (trx) => {
          // 🔐 Idempotency check (we will wire table shortly)
          const existing = await trx
            .selectFrom("stripe_events")
            .select("id")
            .where("id", "=", event.id)
            .executeTakeFirst()

          if (existing) {
            request.log.info(
              { eventId: event.id },
              "Duplicate Stripe event ignored"
            )
            return
          }

          // Record event first (idempotency protection)
          await trx
            .insertInto("stripe_events")
            .values({
              id: event.id,
              type: event.type,
              created_at: new Date(),
            })
            .execute()

          // Delegate to event handler service
          await app.billingService.handleStripeEvent(event, trx)
        })
      } catch (err) {
        request.log.error({ err }, "Stripe webhook processing failed")
        return reply.status(500).send({ error: "Webhook processing failed" })
      }

      return reply.status(200).send({ received: true })
    }
  )
}