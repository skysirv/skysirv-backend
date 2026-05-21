import { config } from "dotenv"
import { z } from "zod"

config()

const envBoolean = z
  .preprocess(
    (value) => {
      if (typeof value !== "string") return value
      return value.trim().toLowerCase()
    },
    z.enum(["true", "false", "1", "0", "yes", "no", "on", "off"]).default("false"),
  )
  .transform((value) => ["true", "1", "yes", "on"].includes(value))

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

    OPENAI_API_KEY: z.string().min(1),
    OPENAI_CHAT_MODEL: z.string().default("gpt-5.4-mini"),
    OPENAI_INTELLIGENCE_MODEL: z.string().default("gpt-5.4"),

    MAPBOX_ACCESS_TOKEN: z.string().min(1),

    DUFFEL_ACCESS_TOKEN: z.string().optional(),
    DUFFEL_API_BASE_URL: z.string().url().default("https://api.duffel.com"),
    DUFFEL_API_VERSION: z.string().default("v2"),

    SMS_PROVIDER: z.enum(["disabled", "twilio"]).default("disabled"),
    SMS_ALERTS_ENABLED: envBoolean,

    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
    TWILIO_FROM_PHONE_NUMBER: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      const productionUrlFields = [
        "APP_BASE_URL",
        "FRONTEND_BASE_URL",
        "STRIPE_SUCCESS_URL",
        "STRIPE_CANCEL_URL",
        "DUFFEL_API_BASE_URL",
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
    }

    if (!env.SMS_ALERTS_ENABLED) return

    if (env.SMS_PROVIDER !== "twilio") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMS_PROVIDER"],
        message: "SMS_PROVIDER must be twilio when SMS_ALERTS_ENABLED is true",
      })
    }

    if (!env.TWILIO_ACCOUNT_SID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TWILIO_ACCOUNT_SID"],
        message: "TWILIO_ACCOUNT_SID is required when SMS alerts are enabled",
      })
    }

    if (!env.TWILIO_AUTH_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TWILIO_AUTH_TOKEN"],
        message: "TWILIO_AUTH_TOKEN is required when SMS alerts are enabled",
      })
    }

    if (!env.TWILIO_MESSAGING_SERVICE_SID && !env.TWILIO_FROM_PHONE_NUMBER) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TWILIO_MESSAGING_SERVICE_SID"],
        message:
          "Either TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_PHONE_NUMBER is required when SMS alerts are enabled",
      })
    }
  })

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error("❌ Invalid environment variables")
  console.error(parsed.error.format())
  process.exit(1)
}

export const env = parsed.data