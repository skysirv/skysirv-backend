import fp from "fastify-plugin"
import fastifyJwt from "@fastify/jwt"
import {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from "fastify"
import { env } from "../config/env.js"

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>
  }
}

export const jwtPlugin = fp(async function (app: FastifyInstance) {
  app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  })

  app.decorate(
    "authenticate",
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify()
      } catch {
        return reply.status(401).send({ error: "Unauthorized" })
      }
    }
  )

  // ❌ NO GLOBAL HOOK
  // Routes must explicitly use preHandler: app.authenticate
})