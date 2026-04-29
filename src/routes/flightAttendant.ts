import { FastifyInstance } from "fastify"
import {
  getOpenAIChatModel,
  getOpenAIIntelligenceModel,
  openai,
} from "../services/openai.js"
import { getUserWatchlist } from "../db/watchlist.js"

type FlightAttendantRole = "user" | "assistant"

type FlightAttendantIncomingMessage = {
  role?: FlightAttendantRole
  content?: string
  text?: string
}

type FlightAttendantChatBody = {
  message?: string
  messages?: FlightAttendantIncomingMessage[]
  tier?: "free" | "pro" | "business"
}

const MAX_CONVERSATION_MESSAGES = 10
const MAX_MESSAGE_LENGTH = 2500

type LucyDashboardSummary = {
  headline: string
  summary: string
  signalFeed: string[]
  systemReadout: string
  recommendedAction: "watch" | "wait" | "book" | "insufficient_data"
  confidence: "low" | "medium" | "high"
  dataStatus: "pending" | "building" | "ready"
}

const FALLBACK_DASHBOARD_SUMMARY: LucyDashboardSummary = {
  headline: "Lucy is reviewing your route intelligence",
  summary:
    "Your dashboard is connected. As Skysirv collects more fare history across your watched routes, Lucy will be able to explain route movement, pricing pressure, and booking confidence with more precision.",
  signalFeed: [
    "Route monitoring is active for your saved watchlist.",
    "Fare intelligence improves as more price snapshots are collected.",
    "Lucy will avoid making confident booking calls until the data supports it.",
  ],
  systemReadout:
    "Dashboard intelligence is building from your watchlist, saved route activity, and available fare history.",
  recommendedAction: "insufficient_data",
  confidence: "low",
  dataStatus: "building",
}

function cleanDashboardSummary(value: unknown): LucyDashboardSummary {
  if (!value || typeof value !== "object") {
    return FALLBACK_DASHBOARD_SUMMARY
  }

  const input = value as Partial<LucyDashboardSummary>

  const recommendedActions: LucyDashboardSummary["recommendedAction"][] = [
    "watch",
    "wait",
    "book",
    "insufficient_data",
  ]

  const confidenceLevels: LucyDashboardSummary["confidence"][] = [
    "low",
    "medium",
    "high",
  ]

  const dataStatuses: LucyDashboardSummary["dataStatus"][] = [
    "pending",
    "building",
    "ready",
  ]

  return {
    headline:
      typeof input.headline === "string" && input.headline.trim()
        ? input.headline.trim().slice(0, 140)
        : FALLBACK_DASHBOARD_SUMMARY.headline,
    summary:
      typeof input.summary === "string" && input.summary.trim()
        ? input.summary.trim().slice(0, 700)
        : FALLBACK_DASHBOARD_SUMMARY.summary,
    signalFeed: Array.isArray(input.signalFeed)
      ? input.signalFeed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 4)
      : FALLBACK_DASHBOARD_SUMMARY.signalFeed,
    systemReadout:
      typeof input.systemReadout === "string" && input.systemReadout.trim()
        ? input.systemReadout.trim().slice(0, 500)
        : FALLBACK_DASHBOARD_SUMMARY.systemReadout,
    recommendedAction:
      input.recommendedAction &&
        recommendedActions.includes(input.recommendedAction)
        ? input.recommendedAction
        : FALLBACK_DASHBOARD_SUMMARY.recommendedAction,
    confidence:
      input.confidence && confidenceLevels.includes(input.confidence)
        ? input.confidence
        : FALLBACK_DASHBOARD_SUMMARY.confidence,
    dataStatus:
      input.dataStatus && dataStatuses.includes(input.dataStatus)
        ? input.dataStatus
        : FALLBACK_DASHBOARD_SUMMARY.dataStatus,
  }
}

function parseDashboardSummaryJson(rawText: string): LucyDashboardSummary {
  try {
    const parsed = JSON.parse(rawText)
    return cleanDashboardSummary(parsed)
  } catch {
    return FALLBACK_DASHBOARD_SUMMARY
  }
}

const FLIGHT_ATTENDANT_SYSTEM_PROMPT = `
You are Lucy, the Skysirv Flight Attendant, a premium AI travel intelligence assistant built into Skysirv.

Your job:
Help travelers understand airfare timing, route behavior, fare movement, booking confidence, alerts, Skyscore, watchlists, and Skysirv's flight intelligence features.

Tone:
Calm, polished, confident, warm, and concise.
Sound like Lucy, Skysirv’s premium in-product flight intelligence concierge.
Do not sound like a generic chatbot.
Do not end replies with vague assistant phrases like “If you want...” or “Let me know...”
When offering a next step, make it specific, Skysirv-native, and useful.

Formatting rules:
Use plain conversational text.
Do not use markdown headings.
Do not use asterisks for bold.
Do not use raw markdown syntax.
Use short paragraphs.
Use simple bullets only when they genuinely improve readability.
Do not over-format.

Important truthfulness and scope rules:
Stay focused on Skysirv, airfare intelligence, route monitoring, watchlists, fare signals, Skyscore, booking confidence, plans, subscriptions, account usage, and travel decision support.
If the user asks something unrelated to Skysirv or travel planning, politely redirect back to Skysirv.
Do not answer general trivia, coding, homework, legal, medical, financial, lifestyle, or unrelated personal questions unless they directly connect to travel planning or Skysirv usage.
For off-topic questions, keep the reply brief and say what Lucy can help with instead.
Do not claim that a route has been added to a watchlist unless the backend explicitly confirms that action.
Do not claim access to live flight inventory, live airline availability, or live booking data unless it is provided in the prompt.
If a user asks Lucy to track, add, remove, update, or manage a route, do not claim the action was completed unless backend action confirmation is provided.
For now, Lucy should explain that dashboard actions must be completed through the dashboard controls.
Lucy may confirm whether the user’s plan has enough route capacity and may restate the route in a clean format.
Do not say “If you want...” as a closing phrase.
If user-specific Skysirv data is not provided, say what you can infer generally and what information would be needed.

Product positioning:
Skysirv is a flight intelligence platform.
Skysirv is not just a flight search site.
Skysirv helps travelers monitor routes, understand pricing behavior, interpret signals, and make better-timed booking decisions.

Strict scope rules:
Lucy is only allowed to answer questions related to Skysirv, airfare intelligence, route monitoring, watchlists, fare signals, Skyscore, booking timing, booking confidence, travel planning, plans, subscriptions, and account usage.

Lucy must refuse unrelated requests.

Unrelated requests include, but are not limited to:
cooking, recipes, poems, jokes, coding, homework, medical advice, legal advice, financial advice, general trivia, relationship advice, lifestyle advice, entertainment, sports, politics, or anything not connected to Skysirv or travel decision support.

For unrelated requests, do not answer the actual question.
Do not provide examples, suggestions, recipes, explanations, poems, or general help.
Give one brief redirect back to Skysirv.

Use this exact style for unrelated requests:
“I’m focused on Skysirv flight intelligence, so I can’t help with that here. I can help with your plan, route tracking, fare signals, watchlists, or booking confidence.”

When useful, ask one clear follow-up question instead of asking for many things at once.
Prefer specific Skysirv follow-ups, such as:
“Would you like me to break down your remaining route capacity?”
“Would you like a quick readout of what your current tracked routes are showing?”
“Would you like me to explain what your plan unlocks inside Skysirv?”
Avoid generic closing lines.
`.trim()

function cleanMessageText(value: unknown) {
  if (typeof value !== "string") return ""

  return value.trim().slice(0, MAX_MESSAGE_LENGTH)
}

function isClearlyOffTopic(message: string) {
  const normalized = message.toLowerCase()

  const travelOrSkysirvSignals = [
    "skysirv",
    "flight",
    "fare",
    "route",
    "watchlist",
    "track",
    "booking",
    "book",
    "airport",
    "airline",
    "ticket",
    "trip",
    "travel",
    "plan",
    "subscription",
    "lucy",
    "skyscore",
    "price",
    "prices",
    "pro",
    "free",
    "business",
  ]

  const offTopicSignals = [
    "cook",
    "dinner",
    "recipe",
    "meal",
    "poem",
    "joke",
    "coding",
    "code",
    "homework",
    "math",
    "medical",
    "doctor",
    "legal",
    "lawyer",
    "financial advice",
    "relationship",
    "sports",
    "politics",
    "movie",
    "song",
  ]

  const hasTravelOrSkysirvSignal = travelOrSkysirvSignals.some((signal) =>
    normalized.includes(signal)
  )

  const hasOffTopicSignal = offTopicSignals.some((signal) =>
    normalized.includes(signal)
  )

  return hasOffTopicSignal && !hasTravelOrSkysirvSignal
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

function normalizePlanId(planId: string | null | undefined) {
  const value = (planId || "free").toLowerCase()

  if (value.includes("pro")) return "pro"
  if (value.includes("business") || value.includes("enterprise")) return "business"

  return "free"
}

function getLucyAccessLevel(normalizedPlan: string) {
  if (normalizedPlan === "business") return "Advanced"
  if (normalizedPlan === "pro") return "Standard"

  return "Limited"
}

function getPlanDisplayName(normalizedPlan: string) {
  if (normalizedPlan === "business") return "Business"
  if (normalizedPlan === "pro") return "Pro"

  return "Free"
}

function getRouteLimit(normalizedPlan: string) {
  if (normalizedPlan === "business") {
    return {
      value: null as number | null,
      label: "unlimited tracked routes",
    }
  }

  if (normalizedPlan === "pro") {
    return {
      value: 25,
      label: "25 tracked routes",
    }
  }

  return {
    value: 3,
    label: "3 tracked routes",
  }
}

function formatMembershipDuration(createdAt: Date | string | null | undefined) {
  if (!createdAt) return "unknown"

  const createdDate = new Date(createdAt)
  const now = new Date()

  if (Number.isNaN(createdDate.getTime())) return "unknown"

  const diffMs = now.getTime() - createdDate.getTime()
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))

  if (diffDays < 1) return "less than 1 day"
  if (diffDays === 1) return "1 day"
  if (diffDays < 30) return `${diffDays} days`

  const diffMonths = Math.floor(diffDays / 30)

  if (diffMonths === 1) return "about 1 month"
  if (diffMonths < 12) return `about ${diffMonths} months`

  const diffYears = Math.floor(diffMonths / 12)
  const remainingMonths = diffMonths % 12

  if (diffYears === 1 && remainingMonths === 0) return "about 1 year"
  if (diffYears === 1) return `about 1 year and ${remainingMonths} months`
  if (remainingMonths === 0) return `about ${diffYears} years`

  return `about ${diffYears} years and ${remainingMonths} months`
}

async function getLucyAccountContext({
  app,
  userId,
  frontendTier,
}: {
  app: FastifyInstance
  userId: string
  frontendTier?: "free" | "pro" | "business"
}) {
  const user = await app.db
    .selectFrom("users")
    .select(["id", "email", "created_at", "is_verified"])
    .where("id", "=", userId)
    .executeTakeFirst()

  const activeSubscription = await app.db
    .selectFrom("subscriptions")
    .select([
      "id",
      "plan_id",
      "status",
      "billing_interval",
      "current_period_end",
      "created_at",
    ])
    .where("user_id", "=", userId)
    .where("status", "=", "active")
    .orderBy("created_at", "desc")
    .executeTakeFirst()

  const rawPlanId = activeSubscription?.plan_id ?? "free"
  const normalizedPlan = normalizePlanId(rawPlanId)
  const planDisplayName = getPlanDisplayName(normalizedPlan)
  const lucyAccessLevel = getLucyAccessLevel(normalizedPlan)
  const routeLimit = getRouteLimit(normalizedPlan)

  const watchlistCountResult = await app.db
    .selectFrom("watchlist")
    .select((eb) => eb.fn.count("id").as("count"))
    .where("user_id", "=", userId)
    .executeTakeFirst()

  const currentTrackedRoutes = Number(watchlistCountResult?.count ?? 0)

  const remainingTrackedRoutes =
    routeLimit.value === null
      ? "unlimited"
      : Math.max(routeLimit.value - currentTrackedRoutes, 0)

  return {
    userEmail: user?.email || "unknown",
    accountCreatedAt: user?.created_at || null,
    membershipDuration: formatMembershipDuration(user?.created_at),
    isVerified: Boolean(user?.is_verified),
    rawPlanId,
    normalizedPlan,
    planDisplayName,
    lucyAccessLevel,
    subscriptionStatus: activeSubscription?.status || "active",
    billingInterval: activeSubscription?.billing_interval || "none",
    currentPeriodEnd: activeSubscription?.current_period_end || null,
    routeLimitLabel: routeLimit.label,
    routeLimitValue: routeLimit.value,
    currentTrackedRoutes,
    remainingTrackedRoutes,
    frontendTier: frontendTier || "not provided",
  }
}

function buildDashboardSummaryInput({
  user,
  accountContext,
  watchlist,
}: {
  user: { id: string; email?: string }
  accountContext: Awaited<ReturnType<typeof getLucyAccountContext>>
  watchlist: Awaited<ReturnType<typeof getUserWatchlist>>
}) {
  const routes = watchlist.slice(0, 12).map((route) => ({
    origin: route.origin,
    destination: route.destination,
    departureDate: route.departure_date,
    latestPrice: route.latest_price,
    averagePrice: route.avg_price ? Number(route.avg_price) / 100 : null,
    latestAirline: route.latest_airline,
    latestFlightNumber: route.latest_flight_number,
    latestCapturedAt: route.latest_captured_at,
    bookingSignal: route.booking_signal,
    volatilityIndex: route.volatility_index,
    recommendedFlightsCount: Array.isArray(route.recommended_flights)
      ? route.recommended_flights.length
      : 0,
  }))

  return [
    {
      role: "system" as const,
      content: `
You are Lucy, the Skysirv Flight Attendant.

Create one concise dashboard intelligence summary for an authenticated Skysirv user.

Return strict JSON only.
Do not include markdown.
Do not include commentary outside the JSON.

The JSON must match this exact shape:
{
  "headline": "string",
  "summary": "string",
  "signalFeed": ["string", "string", "string"],
  "systemReadout": "string",
  "recommendedAction": "watch" | "wait" | "book" | "insufficient_data",
  "confidence": "low" | "medium" | "high",
  "dataStatus": "pending" | "building" | "ready"
}

Rules:
- Never invent prices, airlines, alerts, savings, trends, or route movement.
- Only mention a route-specific signal if the provided data supports it.
- If route history is thin or missing, say intelligence is still building.
- Keep the tone premium, calm, warm, and useful.
- Use the name Lucy only when it feels natural.
- Keep the summary under 90 words.
- Use 2 to 4 signalFeed items.
- Make the systemReadout short and operational.
- recommendedAction should be "insufficient_data" unless there is enough route data to support "watch", "wait", or "book".
- confidence should usually be "low" when latest prices or route history are missing.
- dataStatus should be "pending" when there are no watched routes, "building" when routes exist but data is thin, and "ready" only when enough fare data exists.

User/account context:
User ID: ${user.id}
Email: ${accountContext.userEmail || user.email || "unknown"}
Plan: ${accountContext.planDisplayName}
Lucy access level: ${accountContext.lucyAccessLevel}
Tracked routes: ${accountContext.currentTrackedRoutes}
Route limit: ${accountContext.routeLimitLabel}
Remaining tracked routes: ${accountContext.remainingTrackedRoutes}

Watchlist route context:
${JSON.stringify(routes, null, 2)}
`.trim(),
    },
  ]
}

function buildOpenAIInput({
  user,
  accountContext,
  conversation,
}: {
  user: { id: string; email?: string }
  accountContext: Awaited<ReturnType<typeof getLucyAccountContext>>
  conversation: Array<{
    role: FlightAttendantRole
    content: string
  }>
}) {
  return [
    {
      role: "system" as const,
      content: `${FLIGHT_ATTENDANT_SYSTEM_PROMPT}

Authenticated Skysirv user:
User ID: ${user.id}
Email: ${accountContext.userEmail || user.email || "unknown"}

Verified account: ${accountContext.isVerified ? "yes" : "no"}
Account created at: ${accountContext.accountCreatedAt || "unknown"}
Membership duration: ${accountContext.membershipDuration}

Subscription/account context:
Raw plan ID: ${accountContext.rawPlanId}
Normalized plan: ${accountContext.planDisplayName}
Lucy access level: ${accountContext.lucyAccessLevel}
Subscription status: ${accountContext.subscriptionStatus}
Billing interval: ${accountContext.billingInterval}
Current period end: ${accountContext.currentPeriodEnd || "none"}

Route/watchlist context:
Tracked route limit: ${accountContext.routeLimitLabel}
Current tracked routes: ${accountContext.currentTrackedRoutes}
Remaining tracked routes: ${accountContext.remainingTrackedRoutes}

Frontend dashboard tier hint: ${accountContext.frontendTier}

Use the subscription/account context above as the source of truth when answering questions about the user's plan, Lucy access level, route limit, tracked route count, remaining routes, subscription status, or membership duration.

Important plan facts:
Free includes Limited Lucy access and up to 3 tracked routes.
Pro includes Standard Lucy access and up to 25 tracked routes.
Business includes Advanced Lucy access and unlimited tracked routes.

If the frontend dashboard tier hint conflicts with the subscription/account context, trust the subscription/account context.

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
            "I’m focused on Skysirv flight intelligence, so I can’t help with that here. I can help with your plan, route tracking, fare signals, watchlists, or booking confidence.",
        }
      }

      const accountContext = await getLucyAccountContext({
        app,
        userId: user.id,
        frontendTier: body.tier,
      })

      const model = getOpenAIChatModel()

      const response = await openai.responses.create({
        model,
        input: buildOpenAIInput({
          user,
          accountContext,
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