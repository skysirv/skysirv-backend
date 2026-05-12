import { FastifyInstance } from "fastify"

import { env } from "../config/env.js"
import { stripe } from "../lib/stripeClient.js"
import { logAdminActivity } from "../services/adminActivity.js"

type CheckoutBody = {
  plan: "pro" | "business"
  billing: "monthly" | "yearly"
}

type PortalSessionBody = {
  returnUrl?: string
}

const STRIPE_MANAGED_PLAN_IDS = [
  "pro_monthly",
  "pro_yearly",
  "business_monthly",
  "business_yearly",
]

function getSafeBillingPortalReturnUrl(returnUrl?: string) {
  const fallbackUrl = `${env.FRONTEND_BASE_URL}/account`
  const requestedReturnUrl = returnUrl?.trim()

  if (!requestedReturnUrl) {
    return fallbackUrl
  }

  if (!requestedReturnUrl.startsWith(env.FRONTEND_BASE_URL)) {
    return fallbackUrl
  }

  return requestedReturnUrl
}

function formatPlanLabel(plan: CheckoutBody["plan"], billing: CheckoutBody["billing"]) {
  const planLabel = `${plan.charAt(0).toUpperCase()}${plan.slice(1)}`
  const billingLabel = billing === "yearly" ? "Yearly" : "Monthly"

  return `${planLabel} ${billingLabel}`
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
        const user = request.user as { id: string; email?: string }

        if (!user.id) {
          return reply.status(401).send({ error: "Unauthorized" })
        }

        const body = request.body as CheckoutBody

        if (!body?.plan || !body?.billing) {
          return reply.status(400).send({
            error: "Missing plan or billing type",
          })
        }

        const planId = `${body.plan}_${body.billing}`

        const plan = await app.db
          .selectFrom("plans")
          .selectAll()
          .where("id", "=", planId)
          .executeTakeFirst()

        if (!plan) {
          return reply.status(500).send({
            error: "Plan not configured",
          })
        }

        if (!plan.stripe_price_id) {
          return reply.status(500).send({
            error: "Stripe price ID missing",
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

          success_url: `${env.FRONTEND_BASE_URL}/dashboard/${body.plan}?welcome=1`,
          cancel_url: env.STRIPE_CANCEL_URL,

          metadata: {
            userId: user.id,
            planId,
          },
        })

        const userRecord = await app.db
          .selectFrom("users")
          .select(["email"])
          .where("id", "=", user.id)
          .executeTakeFirst()

        const email = userRecord?.email ?? user.email ?? user.id
        const planLabel = formatPlanLabel(body.plan, body.billing)

        await logAdminActivity(app.db, `Checkout started: ${email} — ${planLabel}`)

        return {
          url: session.url,
        }
      } catch (err) {
        request.log.error(err)
        return reply.status(500).send({
          error: "Checkout session creation failed",
        })
      }
    }
  )

  /**
   * Create Stripe Billing Portal Session
   * POST /billing/portal-session
   *
   * Used by paid recurring users to manage billing, payment methods,
   * invoices, and subscription cancellation through Stripe Customer Portal.
   */
  app.post(
    "/billing/portal-session",
    { preHandler: app.authenticate },
    async (request, reply) => {
      try {
        const user = request.user as { id: string; email?: string }

        if (!user.id) {
          return reply.status(401).send({ error: "Unauthorized" })
        }

        const body = (request.body ?? {}) as PortalSessionBody

        const subscription = await app.db
          .selectFrom("subscriptions")
          .select([
            "plan_id",
            "status",
            "stripe_subscription_id",
          ])
          .where("user_id", "=", user.id)
          .executeTakeFirst()

        if (!subscription) {
          return reply.status(404).send({
            error: "No subscription found for this account",
          })
        }

        if (!STRIPE_MANAGED_PLAN_IDS.includes(subscription.plan_id)) {
          return reply.status(400).send({
            error: "This plan is not managed through Stripe Billing Portal",
          })
        }

        if (!subscription.stripe_subscription_id) {
          return reply.status(400).send({
            error: "Stripe subscription ID missing for this account",
          })
        }

        const stripeSubscription = await stripe.subscriptions.retrieve(
          subscription.stripe_subscription_id
        )

        const customerId =
          typeof stripeSubscription.customer === "string"
            ? stripeSubscription.customer
            : stripeSubscription.customer?.id

        if (!customerId) {
          return reply.status(400).send({
            error: "Stripe customer ID missing for this subscription",
          })
        }

        const portalSession = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: getSafeBillingPortalReturnUrl(body.returnUrl),
        })

        const userRecord = await app.db
          .selectFrom("users")
          .select(["email"])
          .where("id", "=", user.id)
          .executeTakeFirst()

        const email = userRecord?.email ?? user.email ?? user.id

        await logAdminActivity(
          app.db,
          `Billing portal opened: ${email} — ${subscription.plan_id}`
        )

        return {
          url: portalSession.url,
        }
      } catch (err) {
        request.log.error(err)
        return reply.status(500).send({
          error: "Billing portal session creation failed",
        })
      }
    }
  )
}