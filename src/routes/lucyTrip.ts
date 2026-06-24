import { FastifyInstance } from "fastify"

import { getOpenAIChatModel, openai } from "../services/openai.js"
import {
  buildLucyTripTrainingPrompt,
  type LucyTripChatMessage,
  type LucyTripLaunchMode,
  type LucyTripMapPlace,
  type LucyTripPlanSection,
  type LucyTripPlanStatusStep,
  type LucyTripPlanTone,
  type LucyTripStructuredPlan,
  type LucyTripStructuredResponse,
} from "../lucy/training/lucyTripTraining.js"

type LucyTripIncomingMessage = {
  role?: "user" | "assistant"
  content?: string
}

type LucyTripChatBody = {
  launchMode?: LucyTripLaunchMode
  initialIdea?: string
  messages?: LucyTripIncomingMessage[]
}

const LUCY_TRIP_RESPONSE_FORMAT = {
  type: "json_schema",
  name: "lucy_trip_structured_response",
  description: "A structured Lucy Trip planning response.",
  strict: false,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["reply", "plan"],
    properties: {
      reply: {
        type: "string",
      },
      plan: {
        anyOf: [
          {
            type: "null",
          },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "title",
              "subtitle",
              "destinationSummary",
              "statusSteps",
              "sections",
              "mapPlaces",
              "nextQuestions",
            ],
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              destinationSummary: { type: "string" },
              statusSteps: {
                type: "array",
                maxItems: 6,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "status", "tone"],
                  properties: {
                    label: { type: "string" },
                    status: {
                      type: "string",
                      enum: ["complete", "in_progress", "pending"],
                    },
                    tone: {
                      type: "string",
                      enum: [
                        "orange",
                        "purple",
                        "green",
                        "blue",
                        "amber",
                        "rose",
                        "slate",
                      ],
                    },
                  },
                },
              },
              sections: {
                type: "array",
                minItems: 1,
                maxItems: 6,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "id",
                    "title",
                    "navLabel",
                    "icon",
                    "tone",
                    "summary",
                    "blocks",
                  ],
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    navLabel: { type: "string" },
                    icon: {
                      type: "string",
                      enum: [
                        "stay",
                        "food",
                        "go",
                        "about",
                        "alternatives",
                        "next",
                      ],
                    },
                    tone: {
                      type: "string",
                      enum: [
                        "orange",
                        "purple",
                        "green",
                        "blue",
                        "amber",
                        "rose",
                        "slate",
                      ],
                    },
                    summary: { type: "string" },
                    blocks: {
                      type: "array",
                      minItems: 1,
                      maxItems: 8,
                      items: {
                        type: "object",
                        additionalProperties: true,
                      },
                    },
                  },
                },
              },
              mapPlaces: {
                type: "array",
                maxItems: 12,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "name",
                    "category",
                    "description",
                    "latitude",
                    "longitude",
                  ],
                  properties: {
                    name: { type: "string" },
                    category: {
                      type: "string",
                      enum: [
                        "stay",
                        "food",
                        "attraction",
                        "area",
                        "airport",
                        "other",
                      ],
                    },
                    description: { type: "string" },
                    latitude: {
                      anyOf: [{ type: "number" }, { type: "null" }],
                    },
                    longitude: {
                      anyOf: [{ type: "number" }, { type: "null" }],
                    },
                  },
                },
              },
              nextQuestions: {
                type: "array",
                maxItems: 4,
                items: {
                  type: "string",
                },
              },
            },
          },
        ],
      },
    },
  },
} as const

function cleanLucyTripText(value: unknown) {
  if (typeof value !== "string") {
    return ""
  }

  return value.trim().replace(/\s+/g, " ")
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function cleanLucyTripTone(
  value: unknown,
  fallback: LucyTripPlanTone,
): LucyTripPlanTone {
  if (
    value === "orange" ||
    value === "purple" ||
    value === "green" ||
    value === "blue" ||
    value === "amber" ||
    value === "rose" ||
    value === "slate"
  ) {
    return value
  }

  return fallback
}

function cleanLucyTripStatus(
  value: unknown,
): LucyTripPlanStatusStep["status"] {
  if (value === "in_progress" || value === "pending") {
    return value
  }

  return "complete"
}

function cleanLucyTripSectionIcon(
  value: unknown,
): LucyTripPlanSection["icon"] {
  if (
    value === "food" ||
    value === "go" ||
    value === "about" ||
    value === "alternatives" ||
    value === "next"
  ) {
    return value
  }

  return "stay"
}

function cleanLucyTripMapCategory(
  value: unknown,
): LucyTripMapPlace["category"] {
  if (
    value === "food" ||
    value === "attraction" ||
    value === "area" ||
    value === "airport" ||
    value === "other"
  ) {
    return value
  }

  return "stay"
}

function normalizeLucyTripLaunchMode(value: unknown): LucyTripLaunchMode {
  return value === "continue-topic" ? "continue-topic" : "discovery"
}

function normalizeLucyTripMessages(
  messages: LucyTripIncomingMessage[] | undefined,
): LucyTripChatMessage[] {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages
    .map((message) => {
      const role = message.role === "assistant" ? "assistant" : "user"
      const content = cleanLucyTripText(message.content)

      if (!content) {
        return null
      }

      return {
        role,
        content,
      }
    })
    .filter((message): message is LucyTripChatMessage => Boolean(message))
    .slice(-12)
}

function buildLucyTripConversation({
  launchMode,
  initialIdea,
  messages,
}: {
  launchMode: LucyTripLaunchMode
  initialIdea: string
  messages: LucyTripChatMessage[]
}) {
  if (messages.length) {
    return messages
  }

  if (launchMode === "continue-topic" && initialIdea) {
    return [
      {
        role: "user" as const,
        content: initialIdea,
      },
    ]
  }

  return [
    {
      role: "user" as const,
      content:
        "I am not sure where to start. Help me choose a trip direction step by step.",
    },
  ]
}

function buildLucyTripOpenAIInput({
  systemPrompt,
  conversation,
}: {
  systemPrompt: string
  conversation: LucyTripChatMessage[]
}) {
  return [
    {
      role: "system" as const,
      content: systemPrompt,
    },
    ...conversation.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ]
}

function stripJsonCodeFence(rawText: string) {
  let trimmed = rawText.trim()

  if (trimmed.startsWith("```")) {
    trimmed = trimmed
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim()
  }

  const firstBrace = trimmed.indexOf("{")
  const lastBrace = trimmed.lastIndexOf("}")

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim()
  }

  return trimmed
}

function cleanLucyTripPlan(value: unknown): LucyTripStructuredPlan | null {
  if (!isRecord(value)) {
    return null
  }

  const title = safeString(value.title)
  const subtitle = safeString(value.subtitle)
  const destinationSummary = safeString(value.destinationSummary)

  if (!title || !subtitle || !destinationSummary) {
    return null
  }

  const statusSteps: LucyTripPlanStatusStep[] = Array.isArray(value.statusSteps)
    ? value.statusSteps.filter(isRecord).map((step) => ({
      label: safeString(step.label),
      status: cleanLucyTripStatus(step.status),
      tone: cleanLucyTripTone(step.tone, "orange"),
    }))
    : []

  const sections: LucyTripPlanSection[] = Array.isArray(value.sections)
    ? value.sections.filter(isRecord).map((section) => ({
      id: safeString(section.id),
      title: safeString(section.title),
      navLabel: safeString(section.navLabel),
      icon: cleanLucyTripSectionIcon(section.icon),
      tone: cleanLucyTripTone(section.tone, "purple"),
      summary: safeString(section.summary) || undefined,
      blocks: Array.isArray(section.blocks) ? section.blocks : [],
    }))
    : []

  const mapPlaces: LucyTripMapPlace[] = Array.isArray(value.mapPlaces)
    ? value.mapPlaces.filter(isRecord).map((place) => ({
      name: safeString(place.name),
      category: cleanLucyTripMapCategory(place.category),
      description: safeString(place.description) || undefined,
      latitude: typeof place.latitude === "number" ? place.latitude : null,
      longitude: typeof place.longitude === "number" ? place.longitude : null,
    }))
    : []

  const nextQuestions = Array.isArray(value.nextQuestions)
    ? value.nextQuestions
      .map((question) => safeString(question))
      .filter(Boolean)
    : []

  return {
    title,
    subtitle,
    destinationSummary,
    statusSteps: statusSteps.filter((step) => step.label),
    sections: sections.filter(
      (section) => section.id && section.title && section.navLabel,
    ),
    mapPlaces: mapPlaces.filter((place) => place.name),
    nextQuestions,
  }
}

function parseLucyTripStructuredResponse(
  rawText: string,
): LucyTripStructuredResponse {
  const cleanText = stripJsonCodeFence(rawText)

  try {
    const parsed = JSON.parse(cleanText) as unknown

    if (!isRecord(parsed)) {
      throw new Error("Lucy Trip response was not an object")
    }

    const reply = safeString(parsed.reply)
    const plan = cleanLucyTripPlan(parsed.plan)

    return {
      reply:
        reply ||
        "I started shaping this trip, but I could not generate a clean summary.",
      plan,
    }
  } catch {
    return {
      reply:
        "I started shaping this trip, but the plan format came back incomplete. Please try again and I’ll rebuild it cleanly.",
      plan: null,
    }
  }
}

export async function lucyTripRoutes(app: FastifyInstance) {
  app.post(
    "/lucy-trip/chat",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const body = request.body as LucyTripChatBody
      const user = request.user as {
        id: string
        email?: string
        firstName?: string | null
        plan?: string | null
      }

      const launchMode = normalizeLucyTripLaunchMode(body.launchMode)
      const initialIdea = cleanLucyTripText(body.initialIdea)
      const normalizedMessages = normalizeLucyTripMessages(body.messages)

      const conversation = buildLucyTripConversation({
        launchMode,
        initialIdea,
        messages: normalizedMessages,
      })

      if (!conversation.length) {
        return reply.status(400).send({
          success: false,
          error: "Message is required",
        })
      }

      const model = getOpenAIChatModel()

      const systemPrompt = buildLucyTripTrainingPrompt({
        launchMode,
        initialIdea,
        userFirstName: user.firstName || null,
        userPlan: user.plan || null,
        generatedAt: new Date().toISOString(),
      })

      try {
        const response = await openai.responses.create({
          model,
          max_output_tokens: 16000,
          text: {
            format: LUCY_TRIP_RESPONSE_FORMAT,
          },
          input: buildLucyTripOpenAIInput({
            systemPrompt,
            conversation,
          }),
        } as any)

        const lucyTripResponse = parseLucyTripStructuredResponse(
          response.output_text,
        )

        return {
          success: true,
          model,
          reply: lucyTripResponse.reply,
          plan: lucyTripResponse.plan,
        }
      } catch (error) {
        request.log.error(error, "Lucy Trip chat generation failed")

        return reply.status(502).send({
          success: false,
          code: "LUCY_TRIP_RESPONSE_FAILED",
          reply:
            "I’m having trouble shaping this trip right now. Please try again in a moment.",
          plan: null,
        })
      }
    },
  )
}