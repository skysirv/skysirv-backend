export type LucyDashboardSummary = {
    headline: string
    summary: string
    signalFeed: string[]
    systemReadout: string
    recommendedAction: "watch" | "wait" | "book" | "insufficient_data"
    confidence: "low" | "medium" | "high"
    dataStatus: "pending" | "building" | "ready"
}