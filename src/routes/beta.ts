import { FastifyInstance } from "fastify"

export async function betaRoutes(fastify: FastifyInstance) {
    /**
     * Submit beta application
     */
    fastify.post("/beta/apply", async (request, reply) => {
        try {
            const {
                fullName,
                email,
                travelFrequency,
                bookingMethod,
                reason,
            } = request.body as {
                fullName: string
                email: string
                travelFrequency: string
                bookingMethod: string
                reason: string
            }

            // Basic validation
            if (
                !fullName ||
                !email ||
                !travelFrequency ||
                !bookingMethod ||
                !reason
            ) {
                return reply.status(400).send({
                    error: "Missing required fields",
                })
            }

            // Insert into DB
            const result = await (fastify.db as any)
                .insertInto("beta_applications")
                .values({
                    full_name: fullName,
                    email,
                    travel_frequency: travelFrequency,
                    booking_method: bookingMethod,
                    reason,
                    status: "pending",
                })
                .returningAll()
                .executeTakeFirst()

            return reply.send({
                success: true,
                application: result,
            })
        } catch (err) {
            fastify.log.error(err)

            return reply.status(500).send({
                error: "Failed to submit beta application",
            })
        }
    })

    /**
     * Admin: get all beta applications
     */
    fastify.get(
        "/admin/beta-applications",
        {
            preHandler: [fastify.authenticate],
        },
        async (request, reply) => {
            try {
                const applications = await (fastify.db as any)
                    .selectFrom("beta_applications")
                    .selectAll()
                    .orderBy("created_at", "desc")
                    .execute()

                return reply.send({
                    applications,
                })
            } catch (err) {
                fastify.log.error(err)

                return reply.status(500).send({
                    error: "Failed to fetch beta applications",
                })
            }
        }
    )
}