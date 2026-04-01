import { FastifyInstance } from "fastify"
import crypto from "crypto"
import bcrypt from "bcrypt"
import { logAdminActivity } from "../services/adminActivity.js"

export async function inviteRoutes(app: FastifyInstance) {
  app.post("/invite/activate", async (request) => {
    const { token, password } = request.body as {
      token: string
      password: string
    }

    if (!token) {
      throw new Error("Invite token missing")
    }

    if (!password) {
      throw new Error("Password required")
    }

    const invite = await app.db
      .selectFrom("invite_tokens")
      .selectAll()
      .where("token", "=", token)
      .executeTakeFirst()

    if (!invite) {
      throw new Error("Invalid invite token")
    }

    if (invite.used) {
      throw new Error("Invite already used")
    }

    const passwordHash = await bcrypt.hash(password, 10)

    let user = await app.db
      .selectFrom("users")
      .selectAll()
      .where("email", "=", invite.email)
      .executeTakeFirst()

    if (!user) {
      const userId = crypto.randomUUID()

      await app.db
        .insertInto("users")
        .values({
          id: userId,
          provider: "email",
          provider_id: invite.email,
          email: invite.email,
          password: passwordHash,
          created_at: new Date(),
          stripe_customer_id: null,
          is_admin: false,
          is_verified: true
        } as any)
        .execute()

      user = {
        id: userId,
        email: invite.email
      } as any
    } else {
      await app.db
        .updateTable("users")
        .set({
          password: passwordHash,
          is_verified: true
        } as any)
        .where("id", "=", user.id)
        .execute()
    }

    const existingSub = await app.db
      .selectFrom("subscriptions")
      .selectAll()
      .where("user_id", "=", user!.id)
      .executeTakeFirst()

    if (!existingSub) {
      await app.db
        .insertInto("subscriptions")
        .values({
          id: crypto.randomUUID(),
          user_id: user!.id,
          plan_id: "pro",
          status: "active",
          billing_interval: null,
          stripe_subscription_id: null,
          current_period_end: null,
          created_at: new Date()
        } as any)
        .execute()
    } else {
      await app.db
        .updateTable("subscriptions")
        .set({
          plan_id: "pro",
          status: "active",
          billing_interval: null,
          stripe_subscription_id: null,
          current_period_end: null
        } as any)
        .where("id", "=", existingSub.id)
        .execute()
    }

    await app.db
      .updateTable("invite_tokens")
      .set({
        used: true
      })
      .where("token", "=", token)
      .execute()

    await logAdminActivity(app.db, `Lifetime Pro gift redeemed: ${invite.email}`)

    return {
      success: true,
      email: invite.email
    }
  })
}