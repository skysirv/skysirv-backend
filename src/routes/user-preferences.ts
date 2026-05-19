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

