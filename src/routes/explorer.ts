import { FastifyInstance } from "fastify"
import { sql } from "kysely"

type ExplorerRoute = {
  routeHash: string
  route: string
  origin: string
  destination: string
  price: number | null
  currency: string
  skyscore: number | null
  signal: string
}

export async function explorerRoutes(app: FastifyInstance) {
  app.get(
    "/api/routes/explorer",
    {
      preHandler: async (req, reply) => {
        // Allow dashboard access in development
        if (process.env.NODE_ENV === "development") return

        if ((app as any).authenticate) {
          await (app as any).authenticate(req, reply)
        }
      },
    },
    async (req: any) => {
      const db = (app as any).db

      // Read sorting parameter from query
      const sort = req.query?.sort ?? "price"

      /**
       * Subquery: latest timestamp per route
       */
      const latestPerRoute = db
        .selectFrom("flight_price_history")
        .select([
          "route_hash",
          sql`MAX(created_at)`.as("max_created_at"),
        ])
        .groupBy("route_hash")
        .as("lp")

      /**
       * Base query
       */
      let query = db
        .selectFrom("monitored_routes as r")
        .leftJoin(latestPerRoute, "lp.route_hash", "r.route_hash")
        .leftJoin("flight_price_history as p", (join: any) =>
          join
            .onRef("p.route_hash", "=", "r.route_hash")
            .onRef("p.created_at", "=", "lp.max_created_at")
        )
        .select([
          "r.route_hash as route_hash",
          "r.origin as origin",
          "r.destination as destination",
          "p.price as price",
          "p.currency as currency",
          "p.created_at as created_at",
        ])

      /**
       * Apply sorting
       */
      if (sort === "fresh") {
        query = query.orderBy("p.created_at", "desc")
      } else if (sort === "skyscore") {
        // Placeholder until skyscore is persisted
        query = query.orderBy("p.price", "asc")
      } else {
        // Default: cheapest first
        query = query.orderBy("p.price", "asc")
      }

      const rows = await query.execute()

      const routes: ExplorerRoute[] = (rows ?? []).map((row: any) => {
        const origin = row.origin ?? "UNK"
        const destination = row.destination ?? "UNK"
        const route = `${origin}-${destination}`

        return {
          routeHash: row.route_hash,
          route,
          origin,
          destination,
          price: row.price ?? null,
          currency: row.currency ?? "USD",
          skyscore: null,
          signal: "WATCH",
        }
      })

      return { routes }
    }
  )
}