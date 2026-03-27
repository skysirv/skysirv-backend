import { FastifyReply, FastifyRequest } from "fastify"

export async function adminGuard(
  request: FastifyRequest,
  reply: FastifyReply
) {

  const user = request.user as { id: string }

  if (!user?.id) {
    return reply.status(401).send({
      error: "Unauthorized"
    })
  }

  const result = await request.server.db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", user.id)
    .executeTakeFirst()

  const adminUser = result as any

  if (!adminUser || !adminUser.is_admin) {
    return reply.status(403).send({
      error: "Admin access required"
    })
  }

}