import { FastifyInstance } from "fastify"
import { adminGuard } from "../auth/adminGuard.js"
import { env } from "../config/env.js"
import { logAdminActivity } from "../services/adminActivity.js"
import { canSendSms, sendTestSms } from "../services/sms.service.js"

function maskPhoneNumber(phoneNumber: string) {
  const trimmed = phoneNumber.trim()

  if (trimmed.length <= 4) {
    return "****"
  }

  return `****${trimmed.slice(-4)}`
}

export async function adminSmsRoutes(app: FastifyInstance) {
  /**
   * SMS provider status
   */
  app.get(
    "/admin/sms/status",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async () => {
      return {
        success: true,
        sms: {
          provider: env.SMS_PROVIDER,
          alertsEnabled: env.SMS_ALERTS_ENABLED,
          canSend: canSendSms(),
          hasTwilioAccountSid: Boolean(env.TWILIO_ACCOUNT_SID),
          hasTwilioAuthToken: Boolean(env.TWILIO_AUTH_TOKEN),
          hasMessagingServiceSid: Boolean(env.TWILIO_MESSAGING_SERVICE_SID),
          hasFromPhoneNumber: Boolean(env.TWILIO_FROM_PHONE_NUMBER)
        }
      }
    }
  )

  /**
   * Send protected admin SMS test
   */
  app.post(
    "/admin/sms/test",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async (request, reply) => {
      const body = request.body as {
        to?: string
      }

      const to = body?.to?.trim()

      if (!to) {
        return reply.status(400).send({
          success: false,
          error: "Phone number is required",
          message: "Provide a phone number in E.164 format, for example +15551234567."
        })
      }

      const result = await sendTestSms(to)

      await logAdminActivity(
        app.db,
        `SMS test ${result.sent ? "sent" : "skipped"}: ${maskPhoneNumber(to)}`
      )

      return {
        success: true,
        sms: {
          provider: env.SMS_PROVIDER,
          alertsEnabled: env.SMS_ALERTS_ENABLED,
          canSend: canSendSms()
        },
        result
      }
    }
  )
}