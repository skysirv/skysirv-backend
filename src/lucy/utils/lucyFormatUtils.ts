export function formatReadableDate(value?: string | null) {
    if (!value) return null

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) return value

    return date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
    })
}

export function formatVisibleFlightPrice(value?: number | null, currency = "USD") {
    if (typeof value !== "number" || !Number.isFinite(value)) return null

    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(value)
}