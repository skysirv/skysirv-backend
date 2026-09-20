import { FastifyInstance } from "fastify"

import { getUserWatchlist } from "../db/watchlist.js"

import {
  type FlightAttendantChatBody,
  type FlightAttendantDashboardRouteContext,
  type FlightAttendantPublicChatBody,
} from "../lucy/models/flightAttendant.types.js"

import {
  LUCY_REALTIME_MODEL,
  LUCY_REALTIME_VOICE,
} from "../lucy/models/lucyRealtime.config.js"

import { buildDashboardSummaryInput } from "../lucy/prompts/features/dashboardSummary.prompt.js"
import { buildPublicHomepageOpenAIInput } from "../lucy/prompts/features/publicHomepageInput.prompt.js"
import { buildOpenAIInput } from "../lucy/prompts/features/flightAttendantInput.prompt.js"

import {
  getOpenAIChatModel,
  getOpenAIIntelligenceModel,
  openai,
} from "../services/openai.js"
import { saveLucyMemory } from "../services/lucyMemory.service.js"
import { getLucyAccountContext } from "../lucy/services/lucyAccountContext.service.js"
import {
  FALLBACK_DASHBOARD_SUMMARY,
  parseDashboardSummaryJson,
} from "../lucy/services/lucyDashboardSummary.service.js"
import {
  checkPublicLucyDailyLimit,
  getPublicLucyDailyLimitStatus,
  getPublicLucyDailyMessageLimit,
  PUBLIC_LUCY_LIMIT_REACHED_REPLY,
} from "../lucy/services/publicLucyLimit.service.js"
import { isClearlyOffTopic } from "../lucy/services/lucyScopeGuard.service.js"
import { parseLucyStructuredChatResponse } from "../lucy/services/lucyStructuredResponse.service.js"
import { buildVisibleFlightSaveResponse } from "../lucy/services/lucyVisibleFlight.service.js"
import { getRealtimeWatchlistRoutes } from "../lucy/services/lucyRealtimeWatchlist.service.js"
import { createLucyRealtimeClientSecret } from "../lucy/services/lucyRealtimeSession.service.js"

import {
  cleanMessageText,
  normalizeConversation,
} from "../lucy/utils/lucyConversationUtils.js"

export async function flightAttendantRoutes(app: FastifyInstance) {
  app.post(
    "/flight-attendant/memories",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const user = request.user as { id: string; email?: string }

      const body = (request.body || {}) as {
        memoryType?: string
        memoryKey?: string
        memoryText?: string
        memoryValueJson?: unknown | null
      }

      const memoryType =
        typeof body.memoryType === "string" && body.memoryType.trim()
          ? body.memoryType
          : "general_travel_note"

      const memoryKey =
        typeof body.memoryKey === "string" && body.memoryKey.trim()
          ? body.memoryKey
          : ""

      const memoryText =
        typeof body.memoryText === "string" && body.memoryText.trim()
          ? body.memoryText
          : ""

      if (!memoryKey || !memoryText) {
        return reply.status(400).send({
          success: false,
          error: "Memory key and memory text are required.",
        })
      }

      const memory = await saveLucyMemory(app, {
        userId: user.id,
        memoryType,
        memoryKey,
        memoryText,
        memoryValueJson: body.memoryValueJson ?? null,
        confidence: "confirmed",
        source: "user_confirmed",
      })

      return {
        success: true,
        memory,
      }
    }
  )

  app.post(
    "/flight-attendant/realtime-session",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const user = request.user as { id: string; email?: string }
      const body = (request.body || {}) as {
        dashboardRoutes?: FlightAttendantDashboardRouteContext[]
      }

      const accountContext = await getLucyAccountContext({
        app,
        userId: user.id,
      })

      const dashboardRoutesFromBody = Array.isArray(body.dashboardRoutes)
        ? body.dashboardRoutes
        : []

      const watchlistForRealtime = await getRealtimeWatchlistRoutes(
        user.id,
        dashboardRoutesFromBody,
      )

      if (accountContext.normalizedPlan === "free") {
        return reply.status(403).send({
          success: false,
          error: "Lucy is available on Pro and Business plans.",
          code: "LUCY_NOT_INCLUDED",
        })
      }

      if (!process.env.OPENAI_API_KEY) {
        request.log.error("OPENAI_API_KEY is missing for Lucy realtime session")

        return reply.status(500).send({
          success: false,
          error: "Lucy voice is not configured.",
          code: "OPENAI_KEY_MISSING",
        })
      }

      const openaiResponse = await createLucyRealtimeClientSecret({
        userId: user.id,
        accountContext,
        watchlistForRealtime,
      })

      const data = openaiResponse.data

      if (!openaiResponse.ok) {
        request.log.error(
          {
            status: openaiResponse.status,
            data,
          },
          "Failed to create Lucy realtime client secret"
        )

        return reply.status(502).send({
          success: false,
          error: "Lucy voice session could not be created.",
          code: "REALTIME_SESSION_FAILED",
        })
      }

      return {
        success: true,
        model: LUCY_REALTIME_MODEL,
        voice: LUCY_REALTIME_VOICE,
        plan: accountContext.planDisplayName,
        session: data,
      }
    }
  )

  app.get(
    "/flight-attendant/public-chat/status",
    async (request, reply) => {
      try {
        const publicLucyLimit = await getPublicLucyDailyLimitStatus(request)

        return {
          success: true,
          code: publicLucyLimit.allowed
            ? "PUBLIC_LUCY_AVAILABLE"
            : "PUBLIC_LUCY_LIMIT_REACHED",
          limit: getPublicLucyDailyMessageLimit(),
          count: publicLucyLimit.count,
          remaining: publicLucyLimit.remaining,
          resetSeconds: publicLucyLimit.resetSeconds,
          reply: publicLucyLimit.allowed ? null : PUBLIC_LUCY_LIMIT_REACHED_REPLY,
        }
      } catch (error) {
        request.log.error(error, "Public Lucy status check failed")

        return reply.status(503).send({
          success: false,
          code: "PUBLIC_LUCY_STATUS_UNAVAILABLE",
        })
      }
    }
  )

  app.post(
    "/flight-attendant/public-chat",
    async (request, reply) => {
      const body = request.body as FlightAttendantPublicChatBody

      const conversation = normalizeConversation(body)

      if (!conversation.length) {
        return reply.status(400).send({
          error: "Message is required",
        })
      }

      const latestUserMessage =
        cleanMessageText(body.message) ||
        [...conversation].reverse().find((message) => message.role === "user")
          ?.content ||
        ""

      let publicLucyLimit

      try {
        publicLucyLimit = await checkPublicLucyDailyLimit(request)
      } catch (error) {
        request.log.error(error, "Public Lucy rate limit check failed")

        return reply.status(503).send({
          success: false,
          code: "PUBLIC_LUCY_LIMIT_UNAVAILABLE",
          reply:
            "I’m having trouble opening the public preview right now. Please try again in a moment, or sign in to continue with your Skysirv account.",
        })
      }

      if (!publicLucyLimit.allowed) {
        return reply.status(429).send({
          success: false,
          code: "PUBLIC_LUCY_LIMIT_REACHED",
          reply: PUBLIC_LUCY_LIMIT_REACHED_REPLY,
          limit: getPublicLucyDailyMessageLimit(),
          remaining: 0,
          resetSeconds: publicLucyLimit.resetSeconds,
        })
      }

      if (isClearlyOffTopic(latestUserMessage)) {
        return {
          success: true,
          model: "scope-guardrail",
          reply:
            "I’m here for Skysirv and travel support, so I can’t help with that one here. I can help with flights, routes, trip planning, fare signals, watchlists, saved flights, or booking confidence.",
        }
      }

      const model = getOpenAIChatModel()

      const response = await openai.responses.create({
        model,
        input: buildPublicHomepageOpenAIInput({
          conversation,
        }),
      })

      const replyText =
        response.output_text.trim().slice(0, 1800) ||
        "I’m here, but I could not generate a clean response."

      return {
        success: true,
        model,
        reply: replyText,
      }
    }
  )

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

      const latestUserMessage =
        cleanMessageText(body.message) ||
        [...conversation].reverse().find((message) => message.role === "user")
          ?.content ||
        ""

      if (isClearlyOffTopic(latestUserMessage)) {
        return {
          success: true,
          model: "scope-guardrail",
          reply:
            "I’m here for Skysirv and travel support, so I can’t help with that one here. I can help with flights, routes, trip planning, fare signals, watchlists, saved flights, or booking confidence.",
        }
      }

      const accountContext = await getLucyAccountContext({
        app,
        userId: user.id,
        frontendTier: body.tier,
      })

      const dashboardRoutes = Array.isArray(body.dashboardRoutes)
        ? body.dashboardRoutes
        : []

      const visibleFlightSaveResponse = buildVisibleFlightSaveResponse({
        latestUserMessage,
        conversation,
        dashboardRoutes,
      })

      if (visibleFlightSaveResponse) {
        return {
          success: true,
          model: "lucy-visible-flight-action-router",
          reply: visibleFlightSaveResponse.reply,
          action: visibleFlightSaveResponse.action,
        }
      }

      const model = getOpenAIChatModel()

      const response = await openai.responses.create({
        model,
        input: buildOpenAIInput({
          user,
          accountContext,
          conversation,
          dashboardRoutes,
        }),
      })

      const lucyResponse = parseLucyStructuredChatResponse(response.output_text)

      return {
        success: true,
        model,
        reply: lucyResponse.reply,
        action: lucyResponse.action,
      }
    }
  )

  app.post(
    "/flight-attendant/dashboard-summary",
    {
      preHandler: [app.authenticate],
    },
    async (request) => {
      const user = request.user as { id: string; email?: string }

      const accountContext = await getLucyAccountContext({
        app,
        userId: user.id,
      })

      const watchlist = await getUserWatchlist(user.id)
      const model = getOpenAIIntelligenceModel()

      try {
        const response = await openai.responses.create({
          model,
          input: buildDashboardSummaryInput({
            user,
            accountContext,
            watchlist,
          }),
        })

        const summary = parseDashboardSummaryJson(response.output_text)

        return {
          success: true,
          model,
          summary,
        }
      } catch (error) {
        request.log.error(error, "Lucy dashboard summary generation failed")

        return {
          success: true,
          model,
          summary: FALLBACK_DASHBOARD_SUMMARY,
          fallback: true,
        }
      }
    }
  )
}