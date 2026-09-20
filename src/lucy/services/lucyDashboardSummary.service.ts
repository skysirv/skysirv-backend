import { type LucyDashboardSummary } from "../models/lucyDashboard.types.js"

export const FALLBACK_DASHBOARD_SUMMARY: LucyDashboardSummary = {
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

export function cleanDashboardSummary(value: unknown): LucyDashboardSummary {
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

export function parseDashboardSummaryJson(rawText: string): LucyDashboardSummary {
    try {
        const parsed = JSON.parse(rawText)
        return cleanDashboardSummary(parsed)
    } catch {
        return FALLBACK_DASHBOARD_SUMMARY
    }
}