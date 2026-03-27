import { config } from "dotenv"
import { z } from "zod"

config()

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.string().default("3000"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  GOOGLE_CLIENT_ID: z.string().min(1),
  JWT_SECRET: z.string().min(1),

  EMAIL_USER: z.string().email(),
  EMAIL_PASS: z.string().min(1),

  // ==============================
  // Stripe (Test Mode for now)
  // ==============================

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_PUBLISHABLE_KEY: z.string().min(1),

  // We will use this later for webhook signature verification.
  // It can be optional for now until we wire the webhook.
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  STRIPE_SUCCESS_URL: z.string().url(),
  STRIPE_CANCEL_URL: z.string().url(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error("❌ Invalid environment variables")
  console.error(parsed.error.format())
  process.exit(1)
}

export const env = parsed.data