import type { FastifyInstance } from "fastify"
import { createAlertSchema } from "../domain/alerts/schema.js"
import { createAlert } from "../domain/alerts/service.js"

export async function alertsRoutes(app: FastifyInstance) {
  // CREATE
  app.post("/alerts", async (request, reply) => {
    try {
      await request.jwtVerify()

      if (!request.user?.id) {
        return reply.status(401).send({ error: "Unauthorized" })
      }

      const parsed = createAlertSchema.parse(request.body)

      const alert = await createAlert(
        app.db,
        request.user.id,
        parsed
      )

      return reply.status(201).send(alert)
    } catch (err: any) {
      return reply.status(400).send({
        error: err.message ?? "Failed to create alert",
      })
    }
  })

  // LIST
  app.get("/alerts", async (request, reply) => {
    try {
      await request.jwtVerify()

      if (!request.user?.id) {
        return reply.status(401).send({ error: "Unauthorized" })
      }

      const alerts = await app.db
        .selectFrom("alerts")
        .selectAll()
        .where("user_id", "=", request.user.id)
        .orderBy("created_at", "desc")
        .execute()

      return reply.send(alerts)
    } catch (err: any) {
      return reply.status(400).send({
        error: err.message ?? "Failed to fetch alerts",
      })
    }
  })

  // DELETE
  app.delete("/alerts/:id", async (request, reply) => {
    try {
      await request.jwtVerify()

      if (!request.user?.id) {
        return reply.status(401).send({ error: "Unauthorized" })
      }

      const { id } = request.params as { id: string }

      await app.db
        .deleteFrom("alerts")
        .where("id", "=", Number(id))
        .where("user_id", "=", request.user.id)
        .execute()

      return reply.send({ success: true })
    } catch (err: any) {
      return reply.status(400).send({
        error: err.message ?? "Failed to delete alert",
      })
    }
  })
}