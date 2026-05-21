import twilio from "twilio"
import { env } from "../config/env.js"

type SendSmsInput = {
  to: string
  body: string
  category?: "price_alert" | "watchlist_alert" | "system" | "test"
}

type SendSmsResult =
  | {
    sent: true
    skipped: false
    provider: "twilio"
    messageSid: string
    category: SendSmsInput["category"]
  }
  | {
    sent: false
    skipped: true
    provider: "disabled" | "twilio"
    reason: string
    category: SendSmsInput["category"]
  }

let cachedTwilioClient: ReturnType<typeof twilio> | null = null

function getTwilioClient() {
  if (cachedTwilioClient) return cachedTwilioClient

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials are missing")
  }

  cachedTwilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
  return cachedTwilioClient
}

function normalizePhoneNumber(phoneNumber: string) {
  return phoneNumber.trim()
}

function isE164PhoneNumber(phoneNumber: string) {
  return /^\+[1-9]\d{7,14}$/.test(phoneNumber)
}

function cleanSmsBody(body: string) {
  return body.replace(/\s+/g, " ").trim()
}

export function canSendSms() {
  return env.SMS_PROVIDER === "twilio" && env.SMS_ALERTS_ENABLED === true
}

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const category = input.category ?? "system"
  const to = normalizePhoneNumber(input.to)
  const body = cleanSmsBody(input.body)

  if (!canSendSms()) {
    return {
      sent: false,
      skipped: true,
      provider: env.SMS_PROVIDER === "twilio" ? "twilio" : "disabled",
      reason: "SMS alerts are disabled",
      category
    }
  }

  if (!isE164PhoneNumber(to)) {
    return {
      sent: false,
      skipped: true,
      provider: "twilio",
      reason: "Recipient phone number must be in E.164 format, for example +15551234567",
      category
    }
  }

  if (!body) {
    return {
      sent: false,
      skipped: true,
      provider: "twilio",
      reason: "SMS body is empty",
      category
    }
  }

  if (body.length > 1000) {
    return {
      sent: false,
      skipped: true,
      provider: "twilio",
      reason: "SMS body is too long",
      category
    }
  }

  const client = getTwilioClient()

  const message = await client.messages.create(
    env.TWILIO_MESSAGING_SERVICE_SID
      ? {
        to,
        body,
        messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID
      }
      : {
        to,
        body,
        from: env.TWILIO_FROM_PHONE_NUMBER
      }
  )

  return {
    sent: true,
    skipped: false,
    provider: "twilio",
    messageSid: message.sid,
    category
  }
}

export async function sendTestSms(to: string) {
  return sendSms({
    to,
    category: "test",
    body: "Skysirv SMS alerts are connected. Reply STOP to opt out."
  })
}