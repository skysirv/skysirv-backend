import { config } from "dotenv"
import { z } from "zod"

config()

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]),
    PORT: z.string().default("3000"),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),

    GOOGLE_CLIENT_ID: z.string().min(1),
    JWT_SECRET: z.string().min(1),

    EMAIL_USER: z.string().email(),
    EMAIL_PASS: z.string().min(1),

    APP_BASE_URL: z.string().url(),
    FRONTEND_BASE_URL: z.string().url(),

    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_PUBLISHABLE_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),

    STRIPE_SUCCESS_URL: z.string().url(),
    STRIPE_CANCEL_URL: z.string().url(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return

    const productionUrlFields = [
      "APP_BASE_URL",
      "FRONTEND_BASE_URL",
      "STRIPE_SUCCESS_URL",
      "STRIPE_CANCEL_URL",
    ] as const

    for (const field of productionUrlFields) {
      const value = env[field]

      try {
        const url = new URL(value)
        const hostname = url.hostname.toLowerCase()

        if (hostname === "localhost" || hostname === "127.0.0.1") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} cannot use localhost or 127.0.0.1 in production`,
          })
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} must be a valid URL`,
        })
      }
    }
  })

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error("❌ Invalid environment variables")
  console.error(parsed.error.format())
  process.exit(1)
}

export const env = parsed.data