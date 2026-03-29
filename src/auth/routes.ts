import { FastifyInstance } from "fastify"
import crypto from "crypto"
import bcrypt from "bcrypt"
import { sendVerificationEmail } from "../services/email.js"
import { env } from "../config/env.js"

export async function authRoutes(app: FastifyInstance) {
  /**
   * REGISTER NEW USER
   */
  app.post("/auth/register", async (request, reply) => {
    const { email, password } = request.body as {
      email?: string
      password?: string
    }

    console.log("REGISTER BODY:", request.body)

    if (!email || !password) {
      return reply.status(400).send({
        error: "Email and password required"
      })
    }

    const normalizedEmail = email.toLowerCase()

    const existing = await app.db
      .selectFrom("users")
      .select(["id"])
      .where("email", "=", normalizedEmail)
      .executeTakeFirst()

    if (existing) {
      return reply.status(400).send({
        error: "User already exists"
      })
    }

    const userId = crypto.randomUUID()
    const hashedPassword = await bcrypt.hash(password, 10)

    await app.db
      .insertInto("users")
      .values({
        id: userId,
        provider: "local",
        provider_id: crypto.randomUUID(),
        email: normalizedEmail,
        password: hashedPassword,
        created_at: new Date(),
        stripe_customer_id: null,
        is_admin: false,
        is_verified: false
      } as any)
      .execute()

    /**
     * Generate verification token
     */
    const token = crypto.randomBytes(32).toString("hex")

    const expires = new Date()
    expires.setHours(expires.getHours() + 24)

    await app.db
      .insertInto("email_verification_tokens")
      .values({
        id: crypto.randomUUID(),
        user_id: userId,
        token,
        expires_at: expires,
        used: false,
        created_at: new Date()
      } as any)
      .execute()

    /**
     * Build activation link
     */
    const verifyLink = `${env.APP_BASE_URL}/auth/activate/${token}`

    /**
     * Send activation email
     */
    await sendVerificationEmail(normalizedEmail, verifyLink)

    return {
      success: true,
      message: "Account created. Please check your email to activate your account."
    }
  })

  /**
   * ACCOUNT ACTIVATION
   */
  app.get("/auth/activate/:token", async (request, reply) => {
    const { token } = request.params as { token: string }

    const record = await app.db
      .selectFrom("email_verification_tokens")
      .selectAll()
      .where("token", "=", token)
      .executeTakeFirst()

    if (!record) {
      return reply.status(400).send({
        error: "Invalid activation token"
      })
    }

    if (record.used) {
      return reply.status(400).send({
        error: "Activation token already used"
      })
    }

    if (new Date(record.expires_at) < new Date()) {
      return reply.status(400).send({
        error: "Activation token expired"
      })
    }

    /**
     * Verify user
     */
    await app.db
      .updateTable("users")
      .set({
        is_verified: true
      })
      .where("id", "=", record.user_id)
      .execute()

    /**
     * Mark token used
     */
    await app.db
      .updateTable("email_verification_tokens")
      .set({
        used: true
      })
      .where("id", "=", record.id)
      .execute()

    /**
     * Load verified user
     */
    const user = await app.db
      .selectFrom("users")
      .select(["id", "email", "is_admin"])
      .where("id", "=", record.user_id)
      .executeTakeFirst()

    if (!user) {
      return reply.status(404).send({
        error: "User not found"
      })
    }

    /**
     * Create auth token so user lands already signed in
     */
    const authToken = app.jwt.sign({
      id: user.id,
      email: user.email
    })

    /**
     * Redirect to choose plan with token
     */
    return reply.redirect(
      `${env.FRONTEND_BASE_URL}/choose-plan?token=${encodeURIComponent(authToken)}`
    )
  })

  /**
   * DEV SEED USER (optional for development)
   */
  app.post("/auth/dev-seed", async (request, reply) => {
    const { email } = (request.body || {}) as { email?: string }

    if (!email) {
      return reply.status(400).send({ error: "Email is required" })
    }

    const existing = await app.db
      .selectFrom("users")
      .select(["id", "email"])
      .where("email", "=", email)
      .executeTakeFirst()

    if (existing) {
      return {
        ok: true,
        user: existing,
        message: "User already exists",
      }
    }

    const userId = crypto.randomUUID()

    await app.db
      .insertInto("users")
      .values({
        id: userId,
        provider: "dev",
        provider_id: crypto.randomUUID(),
        email,
        password: await bcrypt.hash("devpassword", 10),
        created_at: new Date(),
        stripe_customer_id: null,
        is_admin: false,
        is_verified: true
      } as any)
      .execute()

    await app.db
      .insertInto("subscriptions")
      .values({
        id: crypto.randomUUID(),
        user_id: userId,
        plan_id: "free",
        status: "active",
        billing_interval: null,
        created_at: new Date(),
      } as any)
      .execute()

    return {
      ok: true,
      user: {
        id: userId,
        email,
      },
      message: "Dev user created with Free plan",
    }
  })

  /**
   * PRODUCTION LOGIN
   */
  app.post("/auth/login", async (request, reply) => {
    const { email, password } = request.body as {
      email?: string
      password?: string
    }

    if (!email || !password) {
      return reply.status(400).send({
        error: "Email and password required"
      })
    }

    const user = await app.db
      .selectFrom("users")
      .selectAll()
      .where("email", "=", email.toLowerCase())
      .executeTakeFirst() as {
        id: string
        email: string
        password: string
        is_admin: boolean
        is_verified: boolean
      } | undefined

    if (!user || !user.password) {
      return reply.status(401).send({
        error: "Invalid credentials"
      })
    }

    if (!user.is_verified && process.env.NODE_ENV === "production") {
      return reply.status(403).send({
        error: "Please verify your email before logging in."
      })
    }

    const valid = await bcrypt.compare(password, user.password)

    if (!valid) {
      return reply.status(401).send({
        error: "Invalid credentials"
      })
    }

    const token = app.jwt.sign({
      id: user.id,
      email: user.email
    })

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        is_admin: user.is_admin
      }
    }
  })

  /**
   * SESSION CHECK
   */
  app.get(
    "/auth/session",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = request.user as {
        id: string
        email: string
      }

      const user = await app.db
        .selectFrom("users")
        .select(["id", "email", "is_admin", "created_at", "is_verified"])
        .where("id", "=", authUser.id)
        .executeTakeFirst()

      if (!user) {
        return reply.status(404).send({
          error: "User not found"
        })
      }

      const activeSubscription = await app.db
        .selectFrom("subscriptions")
        .select([
          "id",
          "user_id",
          "plan_id",
          "status",
          "billing_interval",
          "stripe_subscription_id",
          "current_period_end",
          "created_at"
        ])
        .where("user_id", "=", authUser.id)
        .where("status", "=", "active")
        .orderBy("created_at", "desc")
        .executeTakeFirst()

      return {
        user: {
          id: user.id,
          email: user.email,
          is_admin: user.is_admin,
          is_verified: user.is_verified,
          created_at: user.created_at
        },
        subscription: activeSubscription
          ? {
            id: activeSubscription.id,
            user_id: activeSubscription.user_id,
            plan_id: activeSubscription.plan_id,
            status: activeSubscription.status,
            billing_interval: activeSubscription.billing_interval,
            stripe_subscription_id: activeSubscription.stripe_subscription_id,
            current_period_end: activeSubscription.current_period_end,
            created_at: activeSubscription.created_at
          }
          : null
      }
    }
  )
}