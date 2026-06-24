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

    DUFFEL_ACCESS_TOKEN: z.string().min(1),
    DUFFEL_API_BASE_URL: z.string().url().default("https://api.duffel.com"),
    DUFFEL_API_VERSION: z.string().default("v2"),

    CIRIUM_ENABLED: envBoolean,
    CIRIUM_LIVE_AIRCRAFT_ENABLED: envBoolean,
    CIRIUM_API_MODE: z.enum(["flightstats", "sky"]).default("sky"),
    CIRIUM_APP_ID: z.string().optional(),
    CIRIUM_APP_KEY: z.string().optional(),
    CIRIUM_DELAY_INDEX_BASE_URL: z
      .string()
      .url()
      .default("https://api.flightstats.com/flex/delayindex/rest/v1/json"),
    CIRIUM_SKY_IDENTIFIER: z.string().optional(),
    CIRIUM_SKY_SECRET: z.string().optional(),
    CIRIUM_SKY_BASE_URL: z.string().url().optional(),

    FLIGHTAWARE_ENABLED: envBoolean,
    FLIGHTAWARE_API_KEY: z.string().optional(),
    FLIGHTAWARE_AEROAPI_BASE_URL: z
      .string()
      .url()
      .default("https://aeroapi.flightaware.com/aeroapi"),

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

    if (env.CIRIUM_ENABLED && env.CIRIUM_API_MODE === "flightstats") {
      if (!env.CIRIUM_APP_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CIRIUM_APP_ID"],
          message:
            "CIRIUM_APP_ID is required when CIRIUM_ENABLED is true and CIRIUM_API_MODE is flightstats",
        })
      }

      if (!env.CIRIUM_APP_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CIRIUM_APP_KEY"],
          message:
            "CIRIUM_APP_KEY is required when CIRIUM_ENABLED is true and CIRIUM_API_MODE is flightstats",
        })
      }
    }

    if (env.CIRIUM_ENABLED && env.CIRIUM_API_MODE === "sky") {
      if (!env.CIRIUM_SKY_IDENTIFIER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CIRIUM_SKY_IDENTIFIER"],
          message:
            "CIRIUM_SKY_IDENTIFIER is required when CIRIUM_ENABLED is true and CIRIUM_API_MODE is sky",
        })
      }

      if (!env.CIRIUM_SKY_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CIRIUM_SKY_SECRET"],
          message:
            "CIRIUM_SKY_SECRET is required when CIRIUM_ENABLED is true and CIRIUM_API_MODE is sky",
        })
      }

      if (!env.CIRIUM_SKY_BASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CIRIUM_SKY_BASE_URL"],
          message:
            "CIRIUM_SKY_BASE_URL is required when CIRIUM_ENABLED is true and CIRIUM_API_MODE is sky",
        })
      }
    }

    if (env.FLIGHTAWARE_ENABLED && !env.FLIGHTAWARE_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FLIGHTAWARE_API_KEY"],
        message: "FLIGHTAWARE_API_KEY is required when FLIGHTAWARE_ENABLED is true",
      })
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