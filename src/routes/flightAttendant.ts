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
  tier?: "free" | "pro" | "business"
}

const MAX_CONVERSATION_MESSAGES = 10
const MAX_MESSAGE_LENGTH = 2500

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
      content: `Authenticated Skysirv user:
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
}