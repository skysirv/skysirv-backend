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

import {
  isLucyMemoryType,
} from "../lucy/models/lucyMemory.types.js"

import {
  cleanLucyMemorySubject,
} from "../lucy/actions/lucyActionSanitizer.js"

import { buildDashboardSummaryInput } from "../lucy/prompts/features/dashboardSummary.prompt.js"

import { buildPublicHomepageOpenAIInput } from "../lucy/prompts/features/publicHomepageInput.prompt.js"

import { buildOpenAIInput } from "../lucy/prompts/features/flightAttendantInput.prompt.js"

import {
  getOpenAIChatModel,
  getOpenAIIntelligenceModel,
  openai,
} from "../services/openai.js"

import {
  markLucyMemoriesUsed,
} from "../services/lucyMemory.service.js"

import { getLucyAccountContext } from "../lucy/services/lucyAccountContext.service.js"

import {
  executeLucyMemoryCommand,
} from "../lucy/services/lucyMemoryCommand.service.js"

import {
  getRelevantLucyMemories,
} from "../lucy/services/lucyMemoryRetrieval.service.js"

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

import {
  isClearlyOffTopic,
  LUCY_SCOPE_REDIRECT_REPLY,
} from "../lucy/services/lucyScopeGuard.service.js"

import {
  LUCY_STRUCTURED_RESPONSE_FORMAT,
  parseLucyStructuredChatResponse,
  parseLucyStructuredChatResponseValue,
} from "../lucy/services/lucyStructuredResponse.service.js"

import { buildVisibleFlightSaveResponse } from "../lucy/services/lucyVisibleFlight.service.js"

import { getRealtimeWatchlistRoutes } from "../lucy/services/lucyRealtimeWatchlist.service.js"

import {
  createLucyConversation,
  getLucyConversation,
  getLucyConversationMessages,
  getRecentLucyConversations,
  saveLucyConversationMessage,
} from "../lucy/services/lucyConversation.service.js"

import {
  getRelevantRecentConversationContext,
} from "../lucy/services/lucyConversationContext.service.js"

import { createLucyRealtimeClientSecret } from "../lucy/services/lucyRealtimeSession.service.js"

import {
  cleanMessageText,
  normalizeConversation,
} from "../lucy/utils/lucyConversationUtils.js"

import {
  searchLucyFlights,
} from "../lucy/services/lucyFlightSearch.service.js"

export async function flightAttendantRoutes(app: FastifyInstance) {
  app.post(
    "/flight-attendant/memories",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const user = request.user as { id: string; email?: string }

      const body = (request.body || {}) as {
        subject?: unknown
        memoryType?: string
        memoryKey?: string
        memoryText?: string
        memoryValueJson?: unknown | null
        sourceConversationId?: string | null
      }

      const subjectWasProvided =
        body.subject !== undefined &&
        body.subject !== null

      const subject = subjectWasProvided
        ? cleanLucyMemorySubject(body.subject)
        : undefined

      if (subjectWasProvided && !subject) {
        return reply.status(400).send({
          success: false,
          error: "Invalid Lucy memory subject.",
        })
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

      const requestedSourceConversationId =
        typeof body.sourceConversationId === "string" &&
          body.sourceConversationId.trim()
          ? body.sourceConversationId.trim()
          : null

      let sourceConversationId: string | null = null

      if (requestedSourceConversationId) {
        const sourceConversation =
          await getLucyConversation(
            app,
            user.id,
            requestedSourceConversationId
          )

        if (sourceConversation) {
          sourceConversationId =
            sourceConversation.id
        }
      }

      if (!memoryKey || !memoryText) {
        return reply.status(400).send({
          success: false,
          error: "Memory key and memory text are required.",
        })
      }

      const result = await executeLucyMemoryCommand({
        app,
        userId: user.id,
        candidate: {
          ...(subject ? { subject } : {}),
          memoryType: isLucyMemoryType(memoryType)
            ? memoryType
            : "general_travel_note",
          memoryKey,
          memoryText,
          memoryValueJson:
            body.memoryValueJson ?? null,
          confidence: "confirmed",
          source: "explicit_user_statement",
          channel: "voice",
          sourceConversationId,
          sourceMessageId: null,
        },
      })

      return {
        success: true,
        memory: result.memory,
      }
    }
  )

  app.post(
    "/flight-attendant/memories/retrieve",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const user = request.user as {
        id: string
        email?: string
      }

      const body = (request.body || {}) as {
        query?: string
        recentContext?: string[]
      }

      const query =
        typeof body.query === "string"
          ? body.query.trim()
          : ""

      if (!query) {
        return reply.status(400).send({
          success: false,
          error: "Memory retrieval query is required.",
        })
      }

      const recentContext = Array.isArray(
        body.recentContext
      )
        ? body.recentContext
          .filter(
            (item): item is string =>
              typeof item === "string" &&
              Boolean(item.trim())
          )
          .slice(-5)
        : []

      const conversation = [
        ...recentContext.map((content) => ({
          role: "assistant" as const,
          content,
        })),
        {
          role: "user" as const,
          content: query,
        },
      ]

      const memories =
        await getRelevantLucyMemories({
          app,
          userId: user.id,
          conversation,
          limit: 8,
        })

      if (memories.length > 0) {
        await markLucyMemoriesUsed(
          app,
          user.id,
          memories.map((memory) => memory.id)
        )
      }

      return {
        success: true,
        memories: memories.map((memory) => ({
          subject: {
            id: memory.subject_id ?? null,
            type: memory.subject_type ?? null,
            key: memory.subject_key ?? null,
            displayName:
              memory.subject_display_name ?? null,
            relationship:
              memory.subject_relationship_label ?? null,
            aliases:
              Array.isArray(memory.subject_aliases)
                ? memory.subject_aliases
                : [],
          },
          type: memory.memory_type,
          key: memory.memory_key,
          text: memory.memory_text,
          value: memory.memory_value_json,
          confidence: memory.confidence,
          source: memory.source,
        })),
      }
    }
  )

  app.post(
    "/flight-attendant/conversations/retrieve-context",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const user = request.user as {
        id: string
        email?: string
      }

      const body = (request.body || {}) as {
        query?: string
        recentContext?: string[]
        currentConversationId?: string | null
      }

      const query =
        typeof body.query === "string"
          ? body.query.trim()
          : ""

      if (!query) {
        return reply.status(400).send({
          success: false,
          error: "Conversation context query is required.",
        })
      }

      const recentContext = Array.isArray(
        body.recentContext
      )
        ? body.recentContext
          .filter(
            (item): item is string =>
              typeof item === "string" &&
              Boolean(item.trim())
          )
          .slice(-5)
        : []

      const currentConversationId =
        typeof body.currentConversationId === "string" &&
          body.currentConversationId.trim()
          ? body.currentConversationId.trim()
          : null

      const retrievalQuery = [
        ...recentContext,
        query,
      ]
        .join(" ")
        .trim()

      const conversations =
        await getRelevantRecentConversationContext({
          app,
          userId: user.id,
          currentConversationId,
          query: retrievalQuery,
          conversationLimit: 3,
        })

      return {
        success: true,
        conversations: conversations.map(
          (conversation) => ({
            conversationId:
              conversation.conversationId,
            title: conversation.title,
            updatedAt: conversation.updatedAt,
            messages: conversation.messages.map(
              (message) => ({
                role: message.role,
                content: message.content,
                createdAt: message.createdAt,
              })
            ),
          })
        ),
      }
    }
  )

  app.post(
    "/flight-attendant/flights/search",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const body = (request.body || {}) as {
        tripType?: unknown
        origin?: unknown
        destination?: unknown
        departureDate?: unknown
        returnDate?: unknown
        adults?: unknown
        children?: unknown
        infants?: unknown
        cabinClass?: unknown
        maxConnections?: unknown
        airlineIataCode?: unknown
        departurePeriod?: unknown
        maxResults?: unknown
      }

      const tripType =
        body.tripType === "round_trip"
          ? "round_trip"
          : "one_way"

      const origin =
        typeof body.origin === "string"
          ? body.origin.trim().toUpperCase()
          : ""

      const destination =
        typeof body.destination === "string"
          ? body.destination.trim().toUpperCase()
          : ""

      const departureDate =
        typeof body.departureDate === "string"
          ? body.departureDate.trim()
          : ""

      const returnDate =
        typeof body.returnDate === "string" &&
          body.returnDate.trim()
          ? body.returnDate.trim()
          : null

      const cabinClass =
        body.cabinClass === "premium_economy" ||
          body.cabinClass === "business" ||
          body.cabinClass === "first"
          ? body.cabinClass
          : "economy"

      const departurePeriod =
        body.departurePeriod === "early_morning" ||
          body.departurePeriod === "morning" ||
          body.departurePeriod === "afternoon" ||
          body.departurePeriod === "evening"
          ? body.departurePeriod
          : "any"

      if (
        origin.length !== 3 ||
        destination.length !== 3 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(departureDate)
      ) {
        return reply.status(400).send({
          success: false,
          error:
            "Origin, destination, and a valid departure date are required.",
        })
      }

      if (
        tripType === "round_trip" &&
        !returnDate
      ) {
        return reply.status(400).send({
          success: false,
          error:
            "Return date is required for round-trip searches.",
        })
      }

      try {
        const result = await searchLucyFlights({
          tripType,
          origin,
          destination,
          departureDate,
          returnDate,
          adults:
            typeof body.adults === "number"
              ? body.adults
              : 1,
          children:
            typeof body.children === "number"
              ? body.children
              : 0,
          infants:
            typeof body.infants === "number"
              ? body.infants
              : 0,
          cabinClass,
          maxConnections:
            typeof body.maxConnections === "number"
              ? body.maxConnections
              : 1,
          airlineIataCode:
            typeof body.airlineIataCode === "string"
              ? body.airlineIataCode.trim().toUpperCase()
              : null,
          departurePeriod,
          maxResults:
            typeof body.maxResults === "number"
              ? body.maxResults
              : 5,
        })

        return {
          success: true,
          ...result,
        }
      } catch (error) {
        request.log.error(
          { error },
          "Lucy realtime flight search failed"
        )

        return reply.status(502).send({
          success: false,
          error:
            "Lucy could not complete the live flight search right now.",
          offers: [],
        })
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
        conversationId?: string
        clientLocalDateTime?: string
        clientTimeZone?: string | null
      }

      const requestedConversationId =
        typeof body.conversationId === "string"
          ? body.conversationId.trim()
          : ""

      const clientLocalDateTime =
        typeof body.clientLocalDateTime === "string" &&
          body.clientLocalDateTime.trim()
          ? body.clientLocalDateTime.trim()
          : null

      const clientTimeZone =
        typeof body.clientTimeZone === "string" &&
          body.clientTimeZone.trim()
          ? body.clientTimeZone.trim()
          : null

      let conversationCreated = false

      let lucyConversation = requestedConversationId
        ? await getLucyConversation(
          app,
          user.id,
          requestedConversationId
        )
        : undefined

      if (requestedConversationId && !lucyConversation) {
        return reply.status(404).send({
          success: false,
          error: "Lucy conversation not found.",
        })
      }

      if (!lucyConversation) {
        lucyConversation = await createLucyConversation(
          app,
          {
            userId: user.id,
            title: "New conversation",
          }
        )

        conversationCreated = true
      }

      const conversationId = lucyConversation.id

      const persistedConversationMessages =
        await getLucyConversationMessages(
          app,
          user.id,
          conversationId
        )

      const realtimeConversationHistory =
        persistedConversationMessages
          .slice(-12)
          .map((message) => ({
            role:
              message.role === "assistant"
                ? ("assistant" as const)
                : ("user" as const),
            content: message.content,
          }))

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
        conversationHistory: realtimeConversationHistory,
        clientLocalDateTime,
        clientTimeZone,
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
        conversationId,
        conversationCreated,
        conversation: {
          id: lucyConversation.id,
          title: lucyConversation.title,
          pinned: lucyConversation.pinned,
          planned_trip: lucyConversation.planned_trip,
          status: lucyConversation.status,
          created_at: lucyConversation.created_at,
          updated_at: lucyConversation.updated_at,
        },
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
          reply: LUCY_SCOPE_REDIRECT_REPLY,
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

      const requestedConversationId =
        typeof body.conversationId === "string"
          ? body.conversationId.trim()
          : ""

      let lucyConversation = requestedConversationId
        ? await getLucyConversation(
          app,
          user.id,
          requestedConversationId
        )
        : undefined

      if (requestedConversationId && !lucyConversation) {
        return reply.status(404).send({
          error: "Lucy conversation not found.",
        })
      }

      if (!lucyConversation) {
        lucyConversation = await createLucyConversation(
          app,
          {
            userId: user.id,
            title: latestUserMessage || undefined,
          }
        )
      }

      const conversationId = lucyConversation.id

      let sourceUserMessageId: string | null = null

      if (latestUserMessage) {
        const savedUserMessage =
          await saveLucyConversationMessage(
            app,
            {
              userId: user.id,
              conversationId,
              role: "user",
              content: latestUserMessage,
              source: "dashboard_text",
            }
          )

        sourceUserMessageId = savedUserMessage.id
      }

      async function saveAssistantReply(
        content: string
      ) {
        await saveLucyConversationMessage(
          app,
          {
            userId: user.id,
            conversationId,
            role: "assistant",
            content,
            source: "dashboard_text",
          }
        )
      }

      if (isClearlyOffTopic(latestUserMessage)) {
        await saveAssistantReply(
          LUCY_SCOPE_REDIRECT_REPLY
        )

        return {
          success: true,
          model: "scope-guardrail",
          reply: LUCY_SCOPE_REDIRECT_REPLY,
          conversationId,
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
        await saveAssistantReply(
          visibleFlightSaveResponse.reply
        )

        return {
          success: true,
          model: "lucy-visible-flight-action-router",
          reply: visibleFlightSaveResponse.reply,
          action: visibleFlightSaveResponse.action,
          conversationId,
        }
      }

      const model = getOpenAIChatModel()

      const relevantLucyMemories =
        await getRelevantLucyMemories({
          app,
          userId: user.id,
          conversation,
          limit: 8,
        })

      if (relevantLucyMemories.length > 0) {
        await markLucyMemoriesUsed(
          app,
          user.id,
          relevantLucyMemories.map(
            (memory) => memory.id
          )
        )
      }

      const response = await openai.responses.parse({
        model,
        input: buildOpenAIInput({
          user,
          accountContext,
          conversation,
          dashboardRoutes,
          lucyMemories: relevantLucyMemories,
        }),
        text: {
          format: LUCY_STRUCTURED_RESPONSE_FORMAT,
        },
      })

      const lucyResponse =
        response.output_parsed
          ? parseLucyStructuredChatResponseValue(
            response.output_parsed
          )
          : parseLucyStructuredChatResponse(
            response.output_text
          )

      if (
        lucyResponse.action?.type ===
        "save_lucy_memory"
      ) {
        const memoryAction =
          lucyResponse.action

        await executeLucyMemoryCommand({
          app,
          userId: user.id,
          candidate: {
            subject: memoryAction.subject,
            memoryType: isLucyMemoryType(
              memoryAction.memoryType
            )
              ? memoryAction.memoryType
              : "general_travel_note",
            memoryKey: memoryAction.memoryKey,
            memoryText: memoryAction.memoryText,
            memoryValueJson:
              memoryAction.memoryValueJson ?? null,
            confidence: "confirmed",
            source: "conversational",
            channel: "text",
            sourceConversationId: conversationId,
            sourceMessageId: sourceUserMessageId,
          },
        })

        await saveAssistantReply(
          lucyResponse.reply
        )

        return {
          success: true,
          model,
          reply: lucyResponse.reply,
          action: null,
          conversationId,
        }
      }

      await saveAssistantReply(
        lucyResponse.reply
      )

      return {
        success: true,
        model,
        reply: lucyResponse.reply,
        action: lucyResponse.action,
        conversationId,
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