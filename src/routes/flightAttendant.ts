import { FastifyInstance } from "fastify"
import { getOpenAIChatModel, openai } from "../services/openai.js"

type FlightAttendantRole = "user" | "assistant"

type FlightAttendantIncomingMessage = {
  role?: FlightAttendantRole
  content?: string
  text?: string
}

type FlightAttendantChatBody = {
  message?: string
  messages?: FlightAttendantIncomingMessage[]
}

const MAX_CONVERSATION_MESSAGES = 10
const MAX_MESSAGE_LENGTH = 2500

const FLIGHT_ATTENDANT_SYSTEM_PROMPT = `
You are Lucy, the Skysirv Flight Attendant, a premium AI travel intelligence assistant built into Skysirv.

Your job:
Help travelers understand airfare timing, route behavior, fare movement, booking confidence, alerts, Skyscore, watchlists, and Skysirv's flight intelligence features.

Tone:
Calm, polished, confident, warm, and concise.
Sound like a helpful premium travel concierge, not a generic chatbot.

Formatting rules:
Use plain conversational text.
Do not use markdown headings.
Do not use asterisks for bold.
Do not use raw markdown syntax.
Use short paragraphs.
Use simple bullets only when they genuinely improve readability.
Do not over-format.

Important truthfulness rules:
Do not claim that a route has been added to a watchlist unless the backend explicitly confirms that action.
Do not claim access to live flight inventory, live airline availability, or live booking data unless it is provided in the prompt.
If a user asks you to track a route, explain that you can help guide them and that Skysirv can monitor routes, but do not say it has been added yet.
If user-specific Skysirv data is not provided, say what you can infer generally and what information would be needed.

Product positioning:
Skysirv is a flight intelligence platform.
Skysirv is not just a flight search site.
Skysirv helps travelers monitor routes, understand pricing behavior, interpret signals, and make better-timed booking decisions.

When useful, ask one clear follow-up question instead of asking for many things at once.
`.trim()

function cleanMessageText(value: unknown) {
  if (typeof value !== "string") return ""

  return value.trim().slice(0, MAX_MESSAGE_LENGTH)
}

function normalizeConversation(body: FlightAttendantChatBody) {
  const normalized: Array<{
    role: FlightAttendantRole
    content: string
  }> = []

  if (Array.isArray(body.messages)) {
    for (const item of body.messages) {
      const role = item.role === "assistant" ? "assistant" : "user"
      const content = cleanMessageText(item.content ?? item.text)

      if (!content) continue

      normalized.push({
        role,
        content,
      })
    }
  }

  const directMessage = cleanMessageText(body.message)

  if (directMessage) {
    const lastMessage = normalized[normalized.length - 1]

    if (
      !lastMessage ||
      lastMessage.role !== "user" ||
      lastMessage.content !== directMessage
    ) {
      normalized.push({
        role: "user",
        content: directMessage,
      })
    }
  }

  return normalized.slice(-MAX_CONVERSATION_MESSAGES)
}

function buildOpenAIInput({
  user,
  conversation,
}: {
  user: { id: string; email?: string }
  conversation: Array<{
    role: FlightAttendantRole
    content: string
  }>
}) {
  return [
    {
      role: "system" as const,
      content: FLIGHT_ATTENDANT_SYSTEM_PROMPT,
    },
    {
      role: "user" as const,
      content: `Authenticated Skysirv user:
User ID: ${user.id}
Email: ${user.email || "unknown"}

The following is the current page-session conversation. Respond to the latest user message while respecting the prior context.`,
    },
    ...conversation.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ]
}

export async function flightAttendantRoutes(app: FastifyInstance) {
  app.post(
    "/flight-attendant/chat",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const user = request.user as { id: string; email?: string }
      const body = request.body as FlightAttendantChatBody

      const conversation = normalizeConversation(body)

      if (!conversation.length) {
        return reply.status(400).send({
          error: "Message is required",
        })
      }

      const model = getOpenAIChatModel()

      const response = await openai.responses.create({
        model,
        input: buildOpenAIInput({
          user,
          conversation,
        }),
      })

      return {
        success: true,
        model,
        reply: response.output_text,
      }
    }
  )
}