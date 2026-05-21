import { FastifyInstance } from "fastify"
import crypto from "crypto"

function cleanVisitorId(value: unknown) {
  if (typeof value !== "string") return null

  const visitorId = value.trim()

  if (!visitorId) return null
  if (visitorId.length > 120) return null
  if (!/^[a-zA-Z0-9._:-]+$/.test(visitorId)) return null

  return visitorId
}

function cleanPhoneNumber(value: unknown) {
  if (typeof value !== "string") return null

  const phoneNumber = value.trim()

  if (!phoneNumber) return null
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) return null

  return phoneNumber
}

function cleanSourcePage(value: unknown) {
  if (typeof value !== "string") return "homepage"

  const sourcePage = value.trim().replace(/\s+/g, " ")

  if (!sourcePage) return "homepage"
  if (sourcePage.length > 120) return sourcePage.slice(0, 120)

  return sourcePage
}

function hashValue(value: string | undefined | null) {
  if (!value) return null

  return crypto.createHash("sha256").update(value).digest("hex")
}

function getRequestIp(request: any) {
  const forwardedFor = request.headers["x-forwarded-for"]

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() ?? request.ip
  }

  return request.ip
}

export async function publicSmsRoutes(app: FastifyInstance) {
  app.post("/public/sms/subscribe", async (request, reply) => {
    const body = (request.body ?? {}) as {
      visitorId?: unknown
      phoneNumber?: unknown
      sourcePage?: unknown
    }

    const visitorId = cleanVisitorId(body.visitorId)
    const phoneNumber = cleanPhoneNumber(body.phoneNumber)
    const sourcePage = cleanSourcePage(body.sourcePage)

    if (!visitorId) {
      return reply.status(400).send({
        success: false,
        error: "A valid visitorId is required.",
      })
    }

    if (!phoneNumber) {
      return reply.status(400).send({
        success: false,
        error:
          "A valid SMS phone number is required in E.164 format, for example +15551234567.",
      })
    }

    const now = new Date()
    const ipHash = hashValue(getRequestIp(request))
    const userAgentHash = hashValue(request.headers["user-agent"])

    const subscriber = await (app.db as any)
      .insertInto("public_sms_subscribers")
      .values({
        id: crypto.randomUUID(),
        visitor_id: visitorId,
        phone_number: phoneNumber,
        sms_enabled: true,
        price_alerts_enabled: true,
        watchlist_alerts_enabled: true,
        system_alerts_enabled: true,
        source_page: sourcePage,
        ip_hash: ipHash,
        user_agent_hash: userAgentHash,
        sms_opted_in_at: now,
        sms_dismissed_at: null,
        sms_opted_out_at: null,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc: any) =>
        oc.column("visitor_id").doUpdateSet({
          phone_number: phoneNumber,
          sms_enabled: true,
          price_alerts_enabled: true,
          watchlist_alerts_enabled: true,
          system_alerts_enabled: true,
          source_page: sourcePage,
          ip_hash: ipHash,
          user_agent_hash: userAgentHash,
          sms_opted_in_at: now,
          sms_dismissed_at: null,
          sms_opted_out_at: null,
          last_seen_at: now,
          updated_at: now,
        })
      )
      .returning([
        "id",
        "visitor_id",
        "phone_number",
        "sms_enabled",
        "source_page",
        "sms_opted_in_at",
        "created_at",
        "updated_at",
      ])
      .executeTakeFirstOrThrow()

    return reply.send({
      success: true,
      subscriber: {
        id: subscriber.id,
        visitorId: subscriber.visitor_id,
        phoneNumber: subscriber.phone_number,
        smsEnabled: subscriber.sms_enabled,
        sourcePage: subscriber.source_page,
        smsOptedInAt: subscriber.sms_opted_in_at,
        createdAt: subscriber.created_at,
        updatedAt: subscriber.updated_at,
      },
    })
  })

  app.post("/public/sms/dismiss", async (request, reply) => {
    const body = (request.body ?? {}) as {
      visitorId?: unknown
      sourcePage?: unknown
    }

    const visitorId = cleanVisitorId(body.visitorId)
    const sourcePage = cleanSourcePage(body.sourcePage)

    if (!visitorId) {
      return reply.status(400).send({
        success: false,
        error: "A valid visitorId is required.",
      })
    }

    const now = new Date()
    const ipHash = hashValue(getRequestIp(request))
    const userAgentHash = hashValue(request.headers["user-agent"])

    const subscriber = await (app.db as any)
      .insertInto("public_sms_subscribers")
      .values({
        id: crypto.randomUUID(),
        visitor_id: visitorId,
        phone_number: null,
        sms_enabled: false,
        price_alerts_enabled: false,
        watchlist_alerts_enabled: false,
        system_alerts_enabled: false,
        source_page: sourcePage,
        ip_hash: ipHash,
        user_agent_hash: userAgentHash,
        sms_opted_in_at: null,
        sms_dismissed_at: now,
        sms_opted_out_at: null,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc: any) =>
        oc.column("visitor_id").doUpdateSet({
          sms_enabled: false,
          source_page: sourcePage,
          ip_hash: ipHash,
          user_agent_hash: userAgentHash,
          sms_dismissed_at: now,
          last_seen_at: now,
          updated_at: now,
        })
      )
      .returning([
        "id",
        "visitor_id",
        "sms_enabled",
        "source_page",
        "sms_dismissed_at",
        "created_at",
        "updated_at",
      ])
      .executeTakeFirstOrThrow()

    return reply.send({
      success: true,
      subscriber: {
        id: subscriber.id,
        visitorId: subscriber.visitor_id,
        smsEnabled: subscriber.sms_enabled,
        sourcePage: subscriber.source_page,
        smsDismissedAt: subscriber.sms_dismissed_at,
        createdAt: subscriber.created_at,
        updatedAt: subscriber.updated_at,
      },
    })
  })
}