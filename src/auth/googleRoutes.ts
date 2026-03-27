import { FastifyInstance } from "fastify"
import crypto from "crypto"
import { verifyGoogleToken } from "./google.js"

type GoogleAuthUser = {
  id: string
  email: string
  is_admin: boolean
}

type GoogleAuthMode = "signin" | "signup"

export async function googleAuthRoutes(app: FastifyInstance) {
  app.post("/auth/google", async (request, reply) => {
    try {
      const { credential, mode } = (request.body || {}) as {
        credential?: string
        mode?: GoogleAuthMode
      }

      if (!credential) {
        return reply.status(400).send({
          error: "Missing Google credential"
        })
      }

      if (!mode || (mode !== "signin" && mode !== "signup")) {
        return reply.status(400).send({
          error: "Missing or invalid Google auth mode"
        })
      }

      const googleUser = await verifyGoogleToken(credential)

      const existing = await app.db
        .selectFrom("users")
        .select(["id", "email", "is_admin"])
        .where("provider", "=", "google")
        .where("provider_id", "=", googleUser.provider_id)
        .executeTakeFirst()

      let user: GoogleAuthUser

      if (mode === "signin") {
        if (!existing) {
          return reply.status(404).send({
            error: "No account found for this Google user. Please create an account first."
          })
        }

        user = {
          id: existing.id,
          email: existing.email,
          is_admin: existing.is_admin
        }
      } else {
        if (existing) {
          user = {
            id: existing.id,
            email: existing.email,
            is_admin: existing.is_admin
          }
        } else {
          const userId = crypto.randomUUID()

          await app.db
            .insertInto("users")
            .values({
              id: userId,
              provider: "google",
              provider_id: googleUser.provider_id,
              email: googleUser.email,
              password: null,
              created_at: new Date(),
              stripe_customer_id: null,
              is_admin: false,
              is_verified: true
            } as any)
            .execute()

          user = {
            id: userId,
            email: googleUser.email,
            is_admin: false
          }
        }
      }

      const token = app.jwt.sign({
        id: user.id,
        email: user.email
      })

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          is_admin: user.is_admin
        }
      })
    } catch (error) {
      request.log.error(error)

      return reply.status(401).send({
        error: "Google authentication failed"
      })
    }
  })
}