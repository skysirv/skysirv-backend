import { cleanLucySuggestedAction } from "../actions/lucyActionSanitizer.js"
import { type LucyStructuredChatResponse } from "../models/lucyActions.types.js"

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