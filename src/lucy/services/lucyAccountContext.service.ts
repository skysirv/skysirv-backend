import { type FastifyInstance } from "fastify"

import {
    getActiveLucyMemories,
    markLucyMemoriesUsed,
} from "../../services/lucyMemory.service.js"

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

export async function getLucyAccountContext({
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
        .select(["id", "email", "created_at", "is_verified", "first_name"])
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

    const preferredAirports = await app.db
        .selectFrom("user_preferred_airports")
        .select([
            "airport_code",
            "airport_name",
            "city",
            "country",
            "created_at",
            "updated_at",
        ])
        .where("user_id", "=", userId)
        .orderBy("created_at", "desc")
        .execute()

    const preferredRoutes = await app.db
        .selectFrom("user_preferred_routes")
        .select([
            "origin",
            "destination",
            "origin_airport_name",
            "destination_airport_name",
            "origin_city",
            "destination_city",
            "origin_country",
            "destination_country",
            "created_at",
            "updated_at",
        ])
        .where("user_id", "=", userId)
        .orderBy("created_at", "desc")
        .execute()

    const savedFlights = await app.db
        .selectFrom("saved_flights")
        .select([
            "id",
            "origin",
            "destination",
            "departure_date",
            "airline",
            "flight_number",
            "price",
            "currency",
            "status",
            "saved_at",
        ])
        .where("user_id", "=", userId)
        .orderBy("saved_at", "desc")
        .limit(20)
        .execute()

    const lucyMemories = await getActiveLucyMemories(app, userId)

    if (lucyMemories.length > 0) {
        await markLucyMemoriesUsed(app, userId)
    }

    const remainingTrackedRoutes =
        routeLimit.value === null
            ? "unlimited"
            : Math.max(routeLimit.value - currentTrackedRoutes, 0)

    return {
        userEmail: user?.email || "unknown",
        firstName: user?.first_name || null,
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
        preferredAirports,
        preferredRoutes,
        savedFlights,
        lucyMemories,
        frontendTier: frontendTier || "not provided",
    }
}