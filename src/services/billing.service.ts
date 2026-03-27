import type Stripe from "stripe"
import type { Kysely, Transaction } from "kysely"

import { stripe } from "../lib/stripeClient.js"
import { db } from "../db/index.js"
import { env } from "../config/env.js"
import type { Database } from "../db/types.js"

// ==============================
// Checkout Session
// ==============================

export async function createCheckoutSession(
  userId: string,
  planId: string
) {
  const user = await db
    .selectFrom("users")
    .select(["id", "email"])
    .where("id", "=", userId)
    .executeTakeFirst()

  if (!user) {
    throw new Error("User not found")
  }

  const plan = await db
    .selectFrom("plans")
    .select(["id", "stripe_price_id"])
    .where("id", "=", planId)
    .executeTakeFirst()

  if (!plan || !plan.stripe_price_id) {
    throw new Error("Plan not configured for Stripe")
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",

    customer_email: user.email,

    line_items: [
      {
        price: plan.stripe_price_id,
        quantity: 1
      }
    ],

    success_url: env.STRIPE_SUCCESS_URL,
    cancel_url: env.STRIPE_CANCEL_URL,

    metadata: {
      userId: user.id,
      planId: plan.id
    },

    subscription_data: {
      metadata: {
        userId: user.id,
        planId: plan.id
      }
    }
  })

  return session.url
}

// ==============================
// Billing Service
// ==============================

export class BillingService {
  async handleStripeEvent(
    event: Stripe.Event,
    trx: Transaction<Database>
  ): Promise<void> {
    if (event.type === "checkout.session.completed") {
      await this.handleCheckoutCompleted(event, trx)
      return
    }

    if (event.type === "invoice.payment_succeeded") {
      await this.handleInvoicePaid(event, trx)
      return
    }

    if (event.type === "customer.subscription.deleted") {
      await this.handleSubscriptionDeleted(event, trx)
      return
    }
  }

  // ==============================
  // Checkout Completed
  // ==============================

  private async handleCheckoutCompleted(
    event: Stripe.Event,
    trx: Transaction<Database>
  ) {
    const session = event.data.object as any

    const userId = session.metadata?.userId
    const planId = session.metadata?.planId
    const rawSub = session.subscription

    const stripeSubscriptionId =
      typeof rawSub === "string" ? rawSub : rawSub?.id

    if (!userId || !planId || !stripeSubscriptionId) {
      return
    }

    const stripeSub = await stripe.subscriptions.retrieve(
      stripeSubscriptionId
    )

    const stripeSubAny = stripeSub as any

    let periodEnd: Date | null = null

    if (stripeSubAny.current_period_end) {
      periodEnd = new Date(stripeSubAny.current_period_end * 1000)
    }

    const existing = await trx
      .selectFrom("subscriptions")
      .select("id")
      .where("user_id", "=", userId)
      .executeTakeFirst()

    if (existing) {
      await trx
        .updateTable("subscriptions")
        .set({
          plan_id: planId,
          status: stripeSub.status,
          current_period_end: periodEnd ?? null,
          stripe_subscription_id: stripeSubscriptionId
        })
        .where("user_id", "=", userId)
        .execute()
    } else {
      await trx
        .insertInto("subscriptions")
        .values({
          user_id: userId,
          plan_id: planId,
          status: stripeSub.status,
          current_period_end: periodEnd ?? null,
          stripe_subscription_id: stripeSubscriptionId
        } as any)
        .execute()
    }
  }

  // ==============================
  // Invoice Paid
  // ==============================

  private async handleInvoicePaid(
    event: Stripe.Event,
    trx: Transaction<Database>
  ) {
    const invoice = event.data.object as any

    const stripeSubscriptionId = invoice.subscription

    if (!stripeSubscriptionId) return

    const stripeSub = await stripe.subscriptions.retrieve(
      stripeSubscriptionId
    )

    const stripeSubAny = stripeSub as any

    let periodEnd: Date | null = null

    if (stripeSubAny.current_period_end) {
      periodEnd = new Date(stripeSubAny.current_period_end * 1000)
    }

    await trx
      .updateTable("subscriptions")
      .set({
        status: stripeSub.status,
        current_period_end: periodEnd ?? null
      })
      .where("stripe_subscription_id", "=", stripeSubscriptionId)
      .execute()
  }

  // ==============================
  // Subscription Deleted
  // ==============================

  private async handleSubscriptionDeleted(
    event: Stripe.Event,
    trx: Transaction<Database>
  ) {
    const subscription = event.data.object as any

    await trx
      .updateTable("subscriptions")
      .set({
        status: "canceled"
      })
      .where("stripe_subscription_id", "=", subscription.id)
      .execute()
  }
}