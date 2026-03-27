import { FastifyInstance } from "fastify"
import crypto from "crypto"
import bcrypt from "bcrypt"
import { sendVerificationEmail } from "../services/email.js"

export async function loginRoutes(app: FastifyInstance) {
  /**
   * REGISTER NEW USER
   */
  app.post("/register", async (request, reply) => {
    const { email, password } = request.body as {
      email?: string
      password?: string
    }

    if (!email || !password) {
      reply.code(400)
      return { error: "Email and password required" }
    }

    const normalizedEmail = email.toLowerCase()

    const existingUser = await app.db
      .selectFrom("users")
      .select("id")
      .where("email", "=", normalizedEmail)
      .executeTakeFirst()

    if (existingUser) {
      reply.code(400)
      return { error: "User already exists" }
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await app.db
      .insertInto("users")
      .values({
        id: crypto.randomUUID(),
        provider: "local",
        provider_id: crypto.randomUUID(),
        email: normalizedEmail,
        password: hashedPassword,
        created_at: new Date(),
        stripe_customer_id: null,
        is_admin: false,
        is_verified: false,
      })
      .returningAll()
      .executeTakeFirst()

    if (!user) {
      reply.code(500)
      return { error: "Failed to create user" }
    }

    const token = crypto.randomBytes(32).toString("hex")

    const expires = new Date()
    expires.setHours(expires.getHours() + 24)

    await app.db
      .insertInto("email_verification_tokens")
      .values({
        id: crypto.randomUUID(),
        user_id: user.id,
        token,
        expires_at: expires,
        used: false,
        created_at: new Date(),
      })
      .execute()

    const verifyLink = `http://localhost:3000/activate/${token}`

    await sendVerificationEmail(normalizedEmail, verifyLink)

    return {
      success: true,
      message: "Verification email sent",
    }
  })

  /**
   * VERIFY EMAIL
   */
  app.get("/verify/:token", async (request, reply) => {
    const { token } = request.params as { token: string }

    const record = await app.db
      .selectFrom("email_verification_tokens")
      .selectAll()
      .where("token", "=", token)
      .executeTakeFirst()

    if (!record || record.used) {
      reply.code(400)
      return { error: "Invalid or expired token" }
    }

    if (new Date(record.expires_at) < new Date()) {
      reply.code(400)
      return { error: "Token expired" }
    }

    await app.db
      .updateTable("users")
      .set({ is_verified: true })
      .where("id", "=", record.user_id)
      .execute()

    await app.db
      .updateTable("email_verification_tokens")
      .set({ used: true })
      .where("token", "=", token)
      .execute()

    return {
      success: true,
    }
  })

  /**
   * LOGIN USER
   */
  app.post("/login", async (request, reply) => {
    const { email, password } = request.body as {
      email?: string
      password?: string
    }

    if (!email || !password) {
      reply.code(400)
      return { error: "Email and password required" }
    }

    const user = await app.db
      .selectFrom("users")
      .selectAll()
      .where("email", "=", email.toLowerCase())
      .executeTakeFirst()

    if (!user) {
      reply.code(401)
      return { error: "Invalid email or password" }
    }

    if (!user.is_verified) {
      reply.code(403)
      return { error: "Please verify your email first" }
    }

    const valid = await bcrypt.compare(password, user.password)

    if (!valid) {
      reply.code(401)
      return { error: "Invalid email or password" }
    }

    const token = app.jwt.sign({
      id: user.id,
      email: user.email,
    })

    return {
      token,
    }
  })
}