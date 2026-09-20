import { type FlightAttendantDashboardRouteContext, type FlightAttendantRole } from "../models/flightAttendant.types.js"
import { type LucyStructuredChatResponse } from "../models/lucyActions.types.js"
import { cleanAirportCode } from "../utils/lucyAirportUtils.js"
import {
    formatReadableDate,
    formatVisibleFlightPrice,
} from "../utils/lucyFormatUtils.js"

function normalizeFlightSearchText(value?: string | null) {
    return String(value ?? "").toUpperCase().replace(/\s+/g, "")
}

function isVisibleFlightSaveIntent(message: string) {
    const normalized = message.trim().toLowerCase()

    if (!normalized) return false

    const savedFlightQuestionSignals = [
        "what flights do i have saved",
        "what saved flights",
        "show me my saved flights",
        "do i have that flight saved",
        "is that flight saved",
        "have i saved that flight",
        "which flights are saved",
        "flights do i have saved",
        "my saved flights",
    ]

    if (savedFlightQuestionSignals.some((signal) => normalized.includes(signal))) {
        return false
    }

    const directSaveSignals = [
        "save that flight",
        "save this flight",
        "save the flight",
        "save flight",
        "save it to my saved flights",
        "save this one",
        "save that one",
        "add that flight to my saved flights",
        "add this flight to my saved flights",
        "add it to my saved flights",
    ]

    return directSaveSignals.some((signal) => normalized.includes(signal))
}

export function buildVisibleFlightSaveResponse({
    latestUserMessage,
    conversation,
    dashboardRoutes,
}: {
    latestUserMessage: string
    conversation: Array<{
        role: FlightAttendantRole
        content: string
    }>
    dashboardRoutes: FlightAttendantDashboardRouteContext[]
}): LucyStructuredChatResponse | null {
    if (!isVisibleFlightSaveIntent(latestUserMessage)) return null

    const visibleFlights = dashboardRoutes.flatMap((route) => {
        const origin = cleanAirportCode(route.origin)
        const destination = cleanAirportCode(route.destination)

        if (!origin || !destination) return []

        const flights = Array.isArray(route.recommendedFlights)
            ? route.recommendedFlights
            : []

        return flights
            .filter((flight) => flight.flightNumber || flight.airline || flight.airlineName)
            .map((flight) => ({
                route,
                origin,
                destination,
                flight,
                normalizedFlightNumber: normalizeFlightSearchText(flight.flightNumber),
            }))
    })

    if (!visibleFlights.length) {
        return {
            reply:
                "I can help save visible dashboard flights, but I don’t see any available flight options in the current dashboard context yet.",
            action: null,
        }
    }

    const conversationNewestFirst = [...conversation].reverse()

    const matchedByRecentFlightNumber = conversationNewestFirst
        .flatMap((message) => {
            const messageText = normalizeFlightSearchText(message.content)

            return visibleFlights.filter(
                (candidate) =>
                    candidate.normalizedFlightNumber &&
                    messageText.includes(candidate.normalizedFlightNumber),
            )
        })
        .at(0)

    const matchedFlight = matchedByRecentFlightNumber

    if (!matchedFlight) {
        return {
            reply:
                "I can save a visible flight to your Saved Flights. Which flight number should I save?",
            action: null,
        }
    }

    const { route, origin, destination, flight } = matchedFlight

    const airline =
        typeof flight.airline === "string" && flight.airline.trim()
            ? flight.airline.trim().toUpperCase()
            : null

    const airlineName =
        typeof flight.airlineName === "string" && flight.airlineName.trim()
            ? flight.airlineName.trim()
            : null

    const flightNumber =
        typeof flight.flightNumber === "string" && flight.flightNumber.trim()
            ? flight.flightNumber.trim().toUpperCase()
            : null

    const currency =
        typeof flight.currency === "string" && flight.currency.trim()
            ? flight.currency.trim().toUpperCase()
            : "USD"

    const price =
        typeof flight.price === "number" && Number.isFinite(flight.price)
            ? flight.price
            : null

    const departureDate =
        typeof route.departureDate === "string" && route.departureDate.trim()
            ? route.departureDate.trim()
            : null

    const readableDate = formatReadableDate(departureDate)
    const priceLabel = formatVisibleFlightPrice(price, currency)

    const flightLabel = `${airlineName || airline || "Flight"}${flightNumber ? ` ${flightNumber}` : ""
        }`.trim()

    const routeLabel = `${origin} → ${destination}`

    const detailParts = [
        routeLabel,
        readableDate ? `on ${readableDate}` : null,
        priceLabel ? `for ${priceLabel}` : null,
    ].filter(Boolean)

    const confirmationPrompt = `Save ${flightLabel} ${detailParts.join(
        " ",
    )} to your Saved Flights?`

    return {
        reply: confirmationPrompt,
        action: {
            type: "save_visible_flight",
            status: "needs_confirmation",
            origin,
            destination,
            departureDate,
            airline,
            airlineName,
            flightNumber,
            price,
            currency,
            flightLabel,
            confirmationPrompt,
        },
    }
}