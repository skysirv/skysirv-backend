import { type FastifyRequest } from "fastify"
import crypto from "node:crypto"
import { Redis } from "ioredis"

import { env } from "../../config/env.js"

const PUBLIC_LUCY_DAILY_MESSAGE_LIMIT = 5
const PUBLIC_LUCY_LIMIT_WINDOW_SECONDS = 24 * 60 * 60
const PUBLIC_LUCY_LIMIT_WINDOW_MS = PUBLIC_LUCY_LIMIT_WINDOW_SECONDS * 1000

export const PUBLIC_LUCY_LIMIT_REACHED_REPLY =
    "I’d love to keep helping, but public previews are limited for now. Create a free Skysirv account or sign in to continue with the right level of travel support."

let publicLucyRedis: Redis | null = null

const publicLucyLocalLimits = new Map<
    string,
    {
        count: number
        expiresAt: number
    }
>()

function getPublicLucyRedis() {
    if (!publicLucyRedis) {
        publicLucyRedis = new Redis(env.REDIS_URL, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
        })
    }

    return publicLucyRedis
}

function getHeaderString(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
        return value[0] || ""
    }

    return value || ""
}

function getPublicLucyVisitorFingerprint(request: FastifyRequest) {
    const forwardedFor = getHeaderString(request.headers["x-forwarded-for"])
    const realIp = getHeaderString(request.headers["x-real-ip"])
    const cfIp = getHeaderString(request.headers["cf-connecting-ip"])
    const userAgent = getHeaderString(request.headers["user-agent"])

    const ip =
        forwardedFor.split(",")[0]?.trim() ||
        cfIp.trim() ||
        realIp.trim() ||
        request.ip ||
        "unknown"

    return crypto
        .createHash("sha256")
        .update(`${ip}|${userAgent}`)
        .digest("hex")
        .slice(0, 40)
}

function shouldUsePublicLucyLocalLimit() {
    const usesRailwayInternalRedis = env.REDIS_URL.includes("redis.railway.internal")

    const runningInsideRailway = Boolean(
        process.env.RAILWAY_ENVIRONMENT ||
        process.env.RAILWAY_PROJECT_ID ||
        process.env.RAILWAY_SERVICE_ID,
    )

    return usesRailwayInternalRedis && !runningInsideRailway
}

function checkPublicLucyLocalDailyLimit(request: FastifyRequest) {
    const visitorFingerprint = getPublicLucyVisitorFingerprint(request)
    const now = Date.now()
    const existing = publicLucyLocalLimits.get(visitorFingerprint)

    if (!existing || existing.expiresAt <= now) {
        const expiresAt = now + PUBLIC_LUCY_LIMIT_WINDOW_MS

        publicLucyLocalLimits.set(visitorFingerprint, {
            count: 1,
            expiresAt,
        })

        return {
            allowed: true,
            count: 1,
            remaining: PUBLIC_LUCY_DAILY_MESSAGE_LIMIT - 1,
            resetSeconds: Math.ceil((expiresAt - now) / 1000),
        }
    }

    const nextCount = existing.count + 1

    publicLucyLocalLimits.set(visitorFingerprint, {
        ...existing,
        count: nextCount,
    })

    return {
        allowed: nextCount <= PUBLIC_LUCY_DAILY_MESSAGE_LIMIT,
        count: nextCount,
        remaining: Math.max(PUBLIC_LUCY_DAILY_MESSAGE_LIMIT - nextCount, 0),
        resetSeconds: Math.ceil((existing.expiresAt - now) / 1000),
    }
}

function getPublicLucyLocalDailyLimitStatus(request: FastifyRequest) {
    const visitorFingerprint = getPublicLucyVisitorFingerprint(request)
    const now = Date.now()
    const existing = publicLucyLocalLimits.get(visitorFingerprint)

    if (!existing || existing.expiresAt <= now) {
        return {
            allowed: true,
            count: 0,
            remaining: PUBLIC_LUCY_DAILY_MESSAGE_LIMIT,
            resetSeconds: 0,
        }
    }

    return {
        allowed: existing.count <= PUBLIC_LUCY_DAILY_MESSAGE_LIMIT,
        count: existing.count,
        remaining: Math.max(PUBLIC_LUCY_DAILY_MESSAGE_LIMIT - existing.count, 0),
        resetSeconds: Math.ceil((existing.expiresAt - now) / 1000),
    }
}

export async function checkPublicLucyDailyLimit(request: FastifyRequest) {
    if (shouldUsePublicLucyLocalLimit()) {
        return checkPublicLucyLocalDailyLimit(request)
    }

    const redis = getPublicLucyRedis()
    const visitorFingerprint = getPublicLucyVisitorFingerprint(request)
    const key = `skysirv:lucy:public-homepage:${visitorFingerprint}`

    const count = await redis.incr(key)

    if (count === 1) {
        await redis.expire(key, PUBLIC_LUCY_LIMIT_WINDOW_SECONDS)
    }

    const ttl = await redis.ttl(key)

    return {
        allowed: count <= PUBLIC_LUCY_DAILY_MESSAGE_LIMIT,
        count,
        remaining: Math.max(PUBLIC_LUCY_DAILY_MESSAGE_LIMIT - count, 0),
        resetSeconds: ttl > 0 ? ttl : PUBLIC_LUCY_LIMIT_WINDOW_SECONDS,
    }
}

export async function getPublicLucyDailyLimitStatus(request: FastifyRequest) {
    if (shouldUsePublicLucyLocalLimit()) {
        return getPublicLucyLocalDailyLimitStatus(request)
    }

    const redis = getPublicLucyRedis()
    const visitorFingerprint = getPublicLucyVisitorFingerprint(request)
    const key = `skysirv:lucy:public-homepage:${visitorFingerprint}`

    const [rawCount, ttl] = await Promise.all([redis.get(key), redis.ttl(key)])

    const count = Number(rawCount || 0)

    return {
        allowed: count <= PUBLIC_LUCY_DAILY_MESSAGE_LIMIT,
        count,
        remaining: Math.max(PUBLIC_LUCY_DAILY_MESSAGE_LIMIT - count, 0),
        resetSeconds: ttl > 0 ? ttl : 0,
    }
}

export function getPublicLucyDailyMessageLimit() {
    return PUBLIC_LUCY_DAILY_MESSAGE_LIMIT
}