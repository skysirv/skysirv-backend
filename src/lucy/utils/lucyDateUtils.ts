export function cleanDepartureDate(value: unknown) {
    if (typeof value !== "string") return null

    const rawDate = value.trim()

    let year: number | null = null
    let month: number | null = null
    let day: number | null = null

    const isoDateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    const usDateMatch = rawDate.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)

    if (isoDateMatch) {
        year = Number(isoDateMatch[1])
        month = Number(isoDateMatch[2])
        day = Number(isoDateMatch[3])
    } else if (usDateMatch) {
        month = Number(usDateMatch[1])
        day = Number(usDateMatch[2])
        year = Number(usDateMatch[3])
    } else {
        return null
    }

    if (!year || !month || !day) return null

    const parsed = new Date(Date.UTC(year, month - 1, day))

    if (
        Number.isNaN(parsed.getTime()) ||
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() + 1 !== month ||
        parsed.getUTCDate() !== day
    ) {
        return null
    }

    const formattedMonth = String(month).padStart(2, "0")
    const formattedDay = String(day).padStart(2, "0")

    return `${formattedMonth}-${formattedDay}-${year}`
}