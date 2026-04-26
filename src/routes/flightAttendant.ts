import { FastifyInstance } from "fastify"
import { getOpenAIChatModel, openai } from "../services/openai.js"

type FlightAttendantChatBody = {
  message?: string
}

export async function flightAttendantRoutes(app: FastifyInstance) {
  app.post(
    "/flight-attendant/chat",
    {
      preHandler: [app.authenticate]
    },
    async (request, reply) => {
      const user = request.user as { id: string; email?: string }
      const body = request.body as FlightAttendantChatBody

      const message = body?.message?.trim()

      if (!message) {
        return reply.status(400).send({
          error: "Message is required"
        })
      }

      const model = getOpenAIChatModel()

      const response = await openai.responses.create({
        model,
        input: [
          {
            role: "system",
            content:
              "You are Skysirv Flight Attendant, a calm, premium AI travel intelligence assistant. Help users understand airfare timing, route behavior, fare signals, and booking confidence. Keep answers clear, concise, and grounded. Do not claim access to live flight data unless it is provided in the prompt."
          },
          {
            role: "user",
            content: `User email: ${user.email || "unknown"}\n\nUser message: ${message}`
          }
        ]
      })

      return {
        success: true,
        model,
        reply: response.output_text
      }
    }
  )
}