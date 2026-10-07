import { zodTextFormat } from "openai/helpers/zod"
import { z } from "zod"

import { cleanLucySuggestedAction } from "../actions/lucyActionSanitizer.js"
import { type LucyStructuredChatResponse } from "../models/lucyActions.types.js"

const LucyMemorySubjectSchema = z.object({
  subjectType: z.enum([
    "self",
    "person",
    "group",
  ]),
  subjectKey: z.string(),
  displayName: z.string(),
  relationshipLabel: z.string().nullable(),
  aliases: z.array(z.string()),
})

const LucyWatchlistActionSchema = z.object({
  type: z.literal("add_watchlist_route"),
  status: z.literal("needs_confirmation"),
  origin: z.string(),
  destination: z.string(),
  departureDate: z.string(),
  routeLabel: z.string(),
  confirmationPrompt: z.string(),
})

const LucyPreferredAirportsActionSchema = z.object({
  type: z.literal("save_preferred_airports"),
  status: z.literal("needs_confirmation"),
  airportCodes: z.array(z.string()),
  airportLabels: z.array(z.string()),
  confirmationPrompt: z.string(),
})

const LucyPreferredRouteActionSchema = z.object({
  type: z.literal("save_preferred_route"),
  status: z.literal("needs_confirmation"),
  origin: z.string(),
  destination: z.string(),
  routeLabel: z.string(),
  confirmationPrompt: z.string(),
})

const LucySaveFirstNameActionSchema = z.object({
  type: z.literal("save_first_name"),
  status: z.literal("needs_confirmation"),
  firstName: z.string(),
  confirmationPrompt: z.string(),
})

const LucySaveVisibleFlightActionSchema = z.object({
  type: z.literal("save_visible_flight"),
  status: z.literal("needs_confirmation"),
  origin: z.string(),
  destination: z.string(),
  departureDate: z.string().nullable(),
  airline: z.string().nullable(),
  airlineName: z.string().nullable(),
  flightNumber: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
  flightLabel: z.string(),
  confirmationPrompt: z.string(),
})

const LucySaveMemoryActionSchema = z.object({
  type: z.literal("save_lucy_memory"),
  status: z.literal("needs_confirmation"),
  subject: LucyMemorySubjectSchema.nullable(),
  memoryType: z.string(),
  memoryKey: z.string(),
  memoryText: z.string(),
  memoryValueJson: z.null(),
  confirmationPrompt: z.string(),
})

const LucyStructuredActionSchema =
  z.discriminatedUnion("type", [
    LucyWatchlistActionSchema,
    LucyPreferredAirportsActionSchema,
    LucyPreferredRouteActionSchema,
    LucySaveFirstNameActionSchema,
    LucySaveVisibleFlightActionSchema,
    LucySaveMemoryActionSchema,
  ])

export const LucyStructuredResponseSchema =
  z.object({
    reply: z.string(),
    action: LucyStructuredActionSchema.nullable(),
  })

export const LUCY_STRUCTURED_RESPONSE_FORMAT =
  zodTextFormat(
    LucyStructuredResponseSchema,
    "lucy_structured_chat_response"
  )

export function parseLucyStructuredChatResponseValue(
  value: unknown
): LucyStructuredChatResponse {
  const parsed =
    LucyStructuredResponseSchema.parse(value)

  return {
    reply: parsed.reply.trim().slice(0, 1800),
    action: cleanLucySuggestedAction(
      parsed.action
    ),
  }
}

export function parseLucyStructuredChatResponse(
  rawText: string,
): LucyStructuredChatResponse {
  const fallbackReply =
    rawText.trim() || "I’m here, but I could not generate a clean response."

  function parseJsonCandidate(candidate: string) {
    try {
      return JSON.parse(candidate)
    } catch {
      return null
    }
  }

  const parsedDirect = parseJsonCandidate(rawText)
  const parsedFromBlock =
    parsedDirect ?? parseJsonCandidate(rawText.match(/\{[\s\S]*\}/)?.[0] ?? "")

  if (!parsedFromBlock || typeof parsedFromBlock !== "object") {
    return {
      reply: fallbackReply,
      action: null,
    }
  }

  const input = parsedFromBlock as {
    reply?: unknown
    response?: unknown
    answer?: unknown
    action?: unknown
    suggestedAction?: unknown
  }

  if (
    typeof input.reply !== "string" &&
    typeof input.response !== "string" &&
    typeof input.answer !== "string"
  ) {
    const raw = parsedFromBlock as any

    if (raw.plan || raw.subscriptionStatus || raw.lucyAccessLevel) {
      const plan = typeof raw.plan === "string" ? raw.plan : "your current"
      const subscriptionStatus =
        typeof raw.subscriptionStatus === "string" ? raw.subscriptionStatus : "active"
      const lucyAccessLevel =
        typeof raw.lucyAccessLevel === "string" ? raw.lucyAccessLevel : "Lucy"
      const trackedRoutes =
        typeof raw.trackedRoutes === "number" ? raw.trackedRoutes : 0
      const routeLimit =
        typeof raw.routeLimit === "number" ? raw.routeLimit : "your available"
      const remainingRoutes =
        typeof raw.remainingRoutes === "number" ? raw.remainingRoutes : 0

      return {
        reply: `You’re on the ${plan} plan. Your subscription is ${subscriptionStatus}, with ${lucyAccessLevel} Lucy access. You’re tracking ${trackedRoutes} routes out of ${routeLimit} allowed, with ${remainingRoutes} remaining.`,
        action: cleanLucySuggestedAction(input.action ?? input.suggestedAction),
      }
    }
  }

  const replyCandidate =
    typeof input.reply === "string" && input.reply.trim()
      ? input.reply
      : typeof input.response === "string" && input.response.trim()
        ? input.response
        : typeof input.answer === "string" && input.answer.trim()
          ? input.answer
          : fallbackReply

  const reply = replyCandidate.trim().slice(0, 1800)

  return {
    reply,
    action: cleanLucySuggestedAction(input.action ?? input.suggestedAction),
  }
}