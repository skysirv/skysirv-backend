import { FastifyInstance } from "fastify"
import { env } from "../config/env.js"
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

function writeStreamEvent(
  reply: any,
  event: string,
  payload: Record<string, unknown>
) {
  reply.raw.write(`event: ${event}\n`)
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function getAllowedStreamingOrigin(origin?: string) {
  if (!origin) return null

  const allowedExact = [
    env.FRONTEND_BASE_URL,
    "https://skysirv.com",
    "https://www.skysirv.com",
    "https://skysirv-frontend.vercel.app",
  ]

  const isAllowedVercelPreview =
    origin.startsWith("https://skysirv-frontend-") &&
    origin.endsWith(".vercel.app")

  if (allowedExact.includes(origin) || isAllowedVercelPreview) {
    return origin
  }

  return null
}

function extractDeltaFromOpenAIEvent(event: any) {
  if (!event || typeof event !== "object") return ""

  if (
    event.type === "response.output_text.delta" &&
    typeof event.delta === "string"
  ) {
    return event.delta
  }

  if (typeof event.delta === "string") return event.delta
  if (typeof event.text === "string") return event.text
  if (typeof event.content === "string") return event.content

  return ""
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

  app.post(
    "/flight-attendant/chat-stream",
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
      const { debug } = request.query as { debug?: string }
      const debugStream = debug === "1"

      const allowedOrigin = getAllowedStreamingOrigin(request.headers.origin)

      if (allowedOrigin) {
        reply.raw.setHeader("Access-Control-Allow-Origin", allowedOrigin)
        reply.raw.setHeader("Vary", "Origin")
      }

      reply.raw.setHeader("Content-Type", "text/event-stream")
      reply.raw.setHeader("Cache-Control", "no-cache, no-transform")
      reply.raw.setHeader("Connection", "keep-alive")
      reply.raw.setHeader("X-Accel-Buffering", "no")

      reply.raw.flushHeaders?.()

      writeStreamEvent(reply, "meta", {
        success: true,
        model,
      })

      const controller = new AbortController()

      reply.raw.on("close", () => {
        controller.abort()
      })

      try {
        const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            stream: true,
            input: buildOpenAIInput({
              user,
              conversation,
            }),
          }),
        })

        if (!openAIResponse.ok) {
          const errorText = await openAIResponse.text().catch(() => "")

          writeStreamEvent(reply, "error", {
            error:
              errorText ||
              "Skysirv Flight Attendant could not start the streaming response.",
          })

          return
        }

        if (!openAIResponse.body) {
          writeStreamEvent(reply, "error", {
            error: "Skysirv Flight Attendant stream did not return a response body.",
          })

          return
        }

        const reader = openAIResponse.body.getReader()
        const decoder = new TextDecoder()

        let buffer = ""
        let fullText = ""
        let doneSent = false

        while (true) {
          if (request.raw.destroyed || reply.raw.destroyed) {
            break
          }

          const { value, done } = await reader.read()

          if (done) break

          buffer += decoder.decode(value, { stream: true })

          const chunks = buffer.split("\n\n")
          buffer = chunks.pop() || ""

          for (const chunk of chunks) {
            const lines = chunk.split("\n")
            const dataLines = lines
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())

            if (!dataLines.length) continue

            const data = dataLines.join("\n")

            if (!data || data === "[DONE]") continue

            let parsed: any = null

            try {
              parsed = JSON.parse(data)
            } catch {
              if (debugStream) {
                writeStreamEvent(reply, "debug", {
                  raw: data,
                })
              }

              continue
            }

            if (debugStream) {
              writeStreamEvent(reply, "debug", {
                type: parsed?.type,
                keys: Object.keys(parsed || {}),
              })
            }

            const delta = extractDeltaFromOpenAIEvent(parsed)

            if (delta) {
              fullText += delta

              writeStreamEvent(reply, "delta", {
                delta,
              })
            }

            if (parsed?.type === "response.completed") {
              doneSent = true

              writeStreamEvent(reply, "done", {
                reply: fullText,
              })
            }

            if (parsed?.type === "response.failed") {
              doneSent = true

              writeStreamEvent(reply, "error", {
                error:
                  parsed?.response?.error?.message ||
                  "Skysirv Flight Attendant could not complete the response.",
              })
            }
          }
        }

        if (!doneSent) {
          writeStreamEvent(reply, "done", {
            reply: fullText,
          })
        }
      } catch (error: any) {
        if (error?.name !== "AbortError") {
          request.log.error(error)

          writeStreamEvent(reply, "error", {
            error:
              error?.message ||
              "Something went wrong while contacting Skysirv Flight Attendant.",
          })
        }
      } finally {
        reply.raw.end()
      }
    }
  )
}