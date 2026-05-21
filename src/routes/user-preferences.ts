import { FastifyInstance } from "fastify"
import crypto from "crypto"

import { airportDirectory } from "../data/airports.js"

function normalizeAirportCode(value: unknown) {
  if (typeof value !== "string") return null

  const code = value.trim().toUpperCase()

  if (!/^[A-Z0-9]{3,4}$/.test(code)) return null
  if (!airportDirectory[code]) return null

  return code
}

function cleanFirstName(value: unknown) {
  if (typeof value !== "string") return null

  const name = value.trim().replace(/\s+/g, " ")

  if (!name) return null
  if (name.length > 80) return null

  return name
}

function cleanSmsPhoneNumber(value: unknown) {
  if (typeof value !== "string") return null

  const phoneNumber = value.trim()

  if (!phoneNumber) return null
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) return null

  return phoneNumber
}

function cleanOptOutReason(value: unknown) {
  if (typeof value !== "string") return null

  const reason = value.trim().replace(/\s+/g, " ")

  if (!reason) return null
  if (reason.length > 240) return reason.slice(0, 240)

  return reason
}

function parseOptionalBoolean(value: unknown) {
  if (value === undefined) {
    return {
      ok: true,
      value: undefined as boolean | undefined,
    }
  }

  if (typeof value === "boolean") {
    return {
      ok: true,
      value,
    }
  }

  return {
    ok: false,
    value: undefined as boolean | undefined,
  }
}

function getAirportPayload(code: string) {
  const airport = airportDirectory[code]

  if (!airport) return null

  return {
    airport_code: code,
    airport_name: airport.name,
    city: airport.city,
    country: airport.country,
  }
}

function formatSmsPreferences(row: any | null) {
  if (!row) {
    return {
      id: null,
      userId: null,
      phoneNumber: null,
      phoneVerified: false,
      smsEnabled: false,
      priceAlertsEnabled: false,
      watchlistAlertsEnabled: false,
      systemAlertsEnabled: false,
      smsOptedInAt: null,
      smsOptedOutAt: null,
      phoneVerifiedAt: null,
      lastSmsSentAt: null,
      optOutReason: null,
      createdAt: null,
      updatedAt: null,
    }
  }

  return {
    id: row.id,
    userId: row.user_id,
    phoneNumber: row.phone_number,
    phoneVerified: row.phone_verified,
    smsEnabled: row.sms_enabled,
    priceAlertsEnabled: row.price_alerts_enabled,
    watchlistAlertsEnabled: row.watchlist_alerts_enabled,
    systemAlertsEnabled: row.system_alerts_enabled,
    smsOptedInAt: row.sms_opted_in_at,
    smsOptedOutAt: row.sms_opted_out_at,
    phoneVerifiedAt: row.phone_verified_at,
    lastSmsSentAt: row.last_sms_sent_at,
    optOutReason: row.opt_out_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function userPreferencesRoutes(app: FastifyInstance) {
  app.post(
    "/user-preferences/profile-name",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const user = request.user as { id: string; email?: string }

      const body = request.body as {
        firstName?: unknown
      }

      const firstName = cleanFirstName(body.firstName)

      if (!firstName) {
        return reply.status(400).send({
          error: "A valid first name is required.",
        })
      }

      const updatedUser = await app.db
        .updateTable("users")
        .set({
          first_name: firstName,
        })
        .where("id", "=", user.id)
        .returning(["id", "email", "first_name"])
        .executeTakeFirstOrThrow()

      return reply.send({
        success: true,
        user: updatedUser,
      })
    }
  )

  app.get(
    "/user-preferences/sms",
    { preHandler: app.authenticate },
    async (request) => {
      const user = request.user as { id: string; email?: string }

      const smsPreferences = await (app.db as any)
        .selectFrom("user_sms_preferences")
        .selectAll()
        .where("user_id", "=", user.id)
        .executeTakeFirst()

      return {
        success: true,
        smsPreferences: formatSmsPreferences(smsPreferences ?? null),
      }
    }
  )

  app.post(
    "/user-preferences/sms",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const user = request.user as { id: string; email?: string }

      const body = (request.body ?? {}) as {
        phoneNumber?: unknown
        smsEnabled?: unknown
        priceAlertsEnabled?: unknown
        watchlistAlertsEnabled?: unknown
        systemAlertsEnabled?: unknown
        optOutReason?: unknown
      }

      const phoneNumber =
        body.phoneNumber === undefined
          ? undefined
          : cleanSmsPhoneNumber(body.phoneNumber)

      if (body.phoneNumber !== undefined && !phoneNumber) {
        return reply.status(400).send({
          error:
            "A valid SMS phone number is required in E.164 format, for example +15551234567.",
        })
      }

      const smsEnabled = parseOptionalBoolean(body.smsEnabled)
      const priceAlertsEnabled = parseOptionalBoolean(body.priceAlertsEnabled)
      const watchlistAlertsEnabled = parseOptionalBoolean(
        body.watchlistAlertsEnabled
      )
      const systemAlertsEnabled = parseOptionalBoolean(body.systemAlertsEnabled)

      if (
        !smsEnabled.ok ||
        !priceAlertsEnabled.ok ||
        !watchlistAlertsEnabled.ok ||
        !systemAlertsEnabled.ok
      ) {
        return reply.status(400).send({
          error:
            "SMS preference fields must be boolean values when provided.",
        })
      }

      const existingPreferences = await (app.db as any)
        .selectFrom("user_sms_preferences")
        .selectAll()
        .where("user_id", "=", user.id)
        .executeTakeFirst()

      const now = new Date()

      const nextPhoneNumber =
        phoneNumber ?? existingPreferences?.phone_number ?? null

      const wasSmsEnabled = Boolean(existingPreferences?.sms_enabled)
      const nextSmsEnabled =
        smsEnabled.value ?? Boolean(existingPreferences?.sms_enabled)

      const nextPriceAlertsEnabled =
        priceAlertsEnabled.value ??
        Boolean(existingPreferences?.price_alerts_enabled)

      const nextWatchlistAlertsEnabled =
        watchlistAlertsEnabled.value ??
        Boolean(existingPreferences?.watchlist_alerts_enabled)

      const nextSystemAlertsEnabled =
        systemAlertsEnabled.value ??
        Boolean(existingPreferences?.system_alerts_enabled)

      const wantsAnySms =
        nextSmsEnabled ||
        nextPriceAlertsEnabled ||
        nextWatchlistAlertsEnabled ||
        nextSystemAlertsEnabled

      if (wantsAnySms && !nextPhoneNumber) {
        return reply.status(400).send({
          error:
            "A verified phone number is required before SMS alerts can be enabled.",
        })
      }

      const phoneChanged =
        Boolean(phoneNumber) &&
        phoneNumber !== existingPreferences?.phone_number

      const nextPhoneVerified = phoneChanged
        ? false
        : Boolean(existingPreferences?.phone_verified)

      const nextPhoneVerifiedAt = phoneChanged
        ? null
        : existingPreferences?.phone_verified_at ?? null

      const nextSmsOptedInAt =
        nextSmsEnabled && !wasSmsEnabled
          ? now
          : existingPreferences?.sms_opted_in_at ?? null

      const nextSmsOptedOutAt = nextSmsEnabled
        ? null
        : wasSmsEnabled
          ? now
          : existingPreferences?.sms_opted_out_at ?? null

      const nextOptOutReason = nextSmsEnabled
        ? null
        : cleanOptOutReason(body.optOutReason) ??
        existingPreferences?.opt_out_reason ??
        null

      const savedPreferences = await (app.db as any)
        .insertInto("user_sms_preferences")
        .values({
          id: existingPreferences?.id ?? crypto.randomUUID(),
          user_id: user.id,
          phone_number: nextPhoneNumber,
          phone_verified: nextPhoneVerified,
          sms_enabled: nextSmsEnabled,
          price_alerts_enabled: nextPriceAlertsEnabled,
          watchlist_alerts_enabled: nextWatchlistAlertsEnabled,
          system_alerts_enabled: nextSystemAlertsEnabled,
          sms_opted_in_at: nextSmsOptedInAt,
          sms_opted_out_at: nextSmsOptedOutAt,
          phone_verified_at: nextPhoneVerifiedAt,
          last_sms_sent_at: existingPreferences?.last_sms_sent_at ?? null,
          opt_out_reason: nextOptOutReason,
          created_at: existingPreferences?.created_at ?? now,
          updated_at: now,
        })
        .onConflict((oc: any) =>
          oc.column("user_id").doUpdateSet({
            phone_number: nextPhoneNumber,
            phone_verified: nextPhoneVerified,
            sms_enabled: nextSmsEnabled,
            price_alerts_enabled: nextPriceAlertsEnabled,
            watchlist_alerts_enabled: nextWatchlistAlertsEnabled,
            system_alerts_enabled: nextSystemAlertsEnabled,
            sms_opted_in_at: nextSmsOptedInAt,
            sms_opted_out_at: nextSmsOptedOutAt,
            phone_verified_at: nextPhoneVerifiedAt,
            last_sms_sent_at: existingPreferences?.last_sms_sent_at ?? null,
            opt_out_reason: nextOptOutReason,
            updated_at: now,
          })
        )
        .returningAll()
        .executeTakeFirstOrThrow()

      if (nextPhoneNumber) {
        const eventType = phoneChanged
          ? "phone_updated"
          : !wasSmsEnabled && nextSmsEnabled
            ? "opted_in"
            : wasSmsEnabled && !nextSmsEnabled
              ? "opted_out"
              : "preferences_updated"

        await (app.db as any)
          .insertInto("user_sms_events")
          .values({
            id: crypto.randomUUID(),
            user_id: user.id,
            phone_number: nextPhoneNumber,
            event_type: eventType,
            provider: "skysirv",
            provider_message_sid: null,
            metadata_json: JSON.stringify({
              smsEnabled: nextSmsEnabled,
              priceAlertsEnabled: nextPriceAlertsEnabled,
              watchlistAlertsEnabled: nextWatchlistAlertsEnabled,
              systemAlertsEnabled: nextSystemAlertsEnabled,
              phoneVerified: nextPhoneVerified,
            }),
            created_at: now,
          })
          .execute()
      }

      return reply.send({
        success: true,
        smsPreferences: formatSmsPreferences(savedPreferences),
      })
    }
  )

  app.post(
    "/user-preferences/sms/disable",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const user = request.user as { id: string; email?: string }

      const body = (request.body ?? {}) as {
        optOutReason?: unknown
      }

      const existingPreferences = await (app.db as any)
        .selectFrom("user_sms_preferences")
        .selectAll()
        .where("user_id", "=", user.id)
        .executeTakeFirst()

      if (!existingPreferences) {
        return reply.send({
          success: true,
          smsPreferences: formatSmsPreferences(null),
        })
      }

      const now = new Date()
      const optOutReason = cleanOptOutReason(body.optOutReason)

      const updatedPreferences = await (app.db as any)
        .updateTable("user_sms_preferences")
        .set({
          sms_enabled: false,
          price_alerts_enabled: false,
          watchlist_alerts_enabled: false,
          system_alerts_enabled: false,
          sms_opted_out_at: now,
          opt_out_reason: optOutReason ?? existingPreferences.opt_out_reason,
          updated_at: now,
        })
        .where("user_id", "=", user.id)
        .returningAll()
        .executeTakeFirstOrThrow()

      if (existingPreferences.phone_number) {
        await (app.db as any)
          .insertInto("user_sms_events")
          .values({
            id: crypto.randomUUID(),
            user_id: user.id,
            phone_number: existingPreferences.phone_number,
            event_type: "opted_out",
            provider: "skysirv",
            provider_message_sid: null,
            metadata_json: JSON.stringify({
              reason: optOutReason,
            }),
            created_at: now,
          })
          .execute()
      }

      return reply.send({
        success: true,
        smsPreferences: formatSmsPreferences(updatedPreferences),
      })
    }
  )

  app.get(
    "/user-preferences/preferred-airports",
    { preHandler: app.authenticate },
    async (request) => {
      const user = request.user as { id: string; email?: string }

      const preferredAirports = await app.db
        .selectFrom("user_preferred_airports")
        .selectAll()
        .where("user_id", "=", user.id)
        .orderBy("created_at", "desc")
        .execute()

      return {
        success: true,
        preferredAirports,
      }
    }
  )

  app.post(
    "/user-preferences/preferred-airports",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const user = request.user as { id: string; email?: string }

      const body = request.body as {
        airportCode?: unknown
        airportCodes?: unknown
        airports?: unknown
      }

      const rawAirportCodes = Array.isArray(body.airportCodes)
        ? body.airportCodes
        : Array.isArray(body.airports)
          ? body.airports
          : body.airportCode
            ? [body.airportCode]
            : []

      const airportCodes = Array.from(
        new Set(
          rawAirportCodes
            .map(normalizeAirportCode)
            .filter((code): code is string => Boolean(code))
        )
      )

      if (!airportCodes.length) {
        return reply.status(400).send({
          error: "At least one supported airport code is required.",
        })
      }

      const savedAirports = []

      for (const code of airportCodes) {
        const airportPayload = getAirportPayload(code)

        if (!airportPayload) continue

        const savedAirport = await app.db
          .insertInto("user_preferred_airports")
          .values({
            id: crypto.randomUUID(),
            user_id: user.id,
            ...airportPayload,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .onConflict((oc) =>
            oc.columns(["user_id", "airport_code"]).doUpdateSet({
              airport_name: airportPayload.airport_name,
              city: airportPayload.city,
              country: airportPayload.country,
              updated_at: new Date(),
            })
          )
          .returningAll()
          .executeTakeFirstOrThrow()

        savedAirports.push(savedAirport)
      }

      return reply.send({
        success: true,
        preferredAirports: savedAirports,
      })
    }
  )

  app.get(
    "/user-preferences/preferred-routes",
    { preHandler: app.authenticate },
    async (request) => {
      const user = request.user as { id: string; email?: string }

      const preferredRoutes = await app.db
        .selectFrom("user_preferred_routes")
        .selectAll()
        .where("user_id", "=", user.id)
        .orderBy("created_at", "desc")
        .execute()

      return {
        success: true,
        preferredRoutes,
      }
    }
  )

  app.post(
    "/user-preferences/preferred-routes",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const user = request.user as { id: string; email?: string }

      const body = request.body as {
        origin?: unknown
        destination?: unknown
      }

      const origin = normalizeAirportCode(body.origin)
      const destination = normalizeAirportCode(body.destination)

      if (!origin || !destination) {
        return reply.status(400).send({
          error: "Supported origin and destination airport codes are required.",
        })
      }

      if (origin === destination) {
        return reply.status(400).send({
          error: "Origin and destination cannot be the same airport.",
        })
      }

      const originAirport = airportDirectory[origin]
      const destinationAirport = airportDirectory[destination]

      if (!originAirport || !destinationAirport) {
        return reply.status(400).send({
          error: "Unsupported preferred route airport code.",
        })
      }

      const preferredRoute = await app.db
        .insertInto("user_preferred_routes")
        .values({
          id: crypto.randomUUID(),
          user_id: user.id,
          origin,
          destination,
          origin_airport_name: originAirport.name,
          destination_airport_name: destinationAirport.name,
          origin_city: originAirport.city,
          destination_city: destinationAirport.city,
          origin_country: originAirport.country,
          destination_country: destinationAirport.country,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .onConflict((oc) =>
          oc.columns(["user_id", "origin", "destination"]).doUpdateSet({
            origin_airport_name: originAirport.name,
            destination_airport_name: destinationAirport.name,
            origin_city: originAirport.city,
            destination_city: destinationAirport.city,
            origin_country: originAirport.country,
            destination_country: destinationAirport.country,
            updated_at: new Date(),
          })
        )
        .returningAll()
        .executeTakeFirstOrThrow()

      return reply.send({
        success: true,
        preferredRoute,
      })
    }
  )
}