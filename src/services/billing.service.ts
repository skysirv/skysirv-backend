import type Stripe from "stripe"
import type { Transaction } from "kysely"

import { stripe } from "../lib/stripeClient.js"
import type { Database } from "../db/types.js"
import { logAdminActivity } from "./adminActivity.js"

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
          stripe_subscription_id: stripeSubscriptionId,
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
          stripe_subscription_id: stripeSubscriptionId,
        } as any)
        .execute()
    }

    // 🔥 ADMIN ACTIVITY LOG (THIS IS THE BIG ONE)
    const user = await trx
      .selectFrom("users")
      .select(["email"])
      .where("id", "=", userId)
      .executeTakeFirst()

    const email = user?.email ?? userId

    await logAdminActivity(
      trx,
      `Subscription activated: ${email} — ${planId}`
    )
  }

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
        current_period_end: periodEnd ?? null,
      })
      .where("stripe_subscription_id", "=", stripeSubscriptionId)
      .execute()
  }

  private async handleSubscriptionDeleted(
    event: Stripe.Event,
    trx: Transaction<Database>
  ) {
    const subscription = event.data.object as any

    await trx
      .updateTable("subscriptions")
      .set({
        status: "canceled",
      })
      .where("stripe_subscription_id", "=", subscription.id)
      .execute()

    // Optional: log cancellation (nice to have)
    await logAdminActivity(
      trx,
      `Subscription canceled: ${subscription.id}`
    )
  }
}