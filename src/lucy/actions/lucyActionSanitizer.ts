import {
    type LucyPreferredAirportsAction,
    type LucyPreferredRouteAction,
    type LucySaveFirstNameAction,
    type LucySaveMemoryAction,
    type LucySaveVisibleFlightAction,
    type LucySuggestedAction,
    type LucyWatchlistAction,
} from "../models/lucyActions.types.js"
import {
    cleanAirportCode,
    getAirportDisplayLabel,
} from "../utils/lucyAirportUtils.js"
import { cleanDepartureDate } from "../utils/lucyDateUtils.js"

export function cleanLucyWatchlistAction(value: unknown): LucyWatchlistAction | null {
    if (!value || typeof value !== "object") return null

    const input = value as Partial<LucyWatchlistAction>

    if (input.type !== "add_watchlist_route") return null

    const origin = cleanAirportCode(input.origin)
    const destination = cleanAirportCode(input.destination)
    const departureDate = cleanDepartureDate(input.departureDate)

    if (!origin || !destination || !departureDate) return null
    if (origin === destination) return null

    const originLabel = getAirportDisplayLabel(origin)
    const destinationLabel = getAirportDisplayLabel(destination)

    return {
        type: "add_watchlist_route",
        status: "needs_confirmation",
        origin,
        destination,
        departureDate,
        routeLabel:
            typeof input.routeLabel === "string" && input.routeLabel.trim()
                ? input.routeLabel.trim().slice(0, 120)
                : `${originLabel} → ${destinationLabel}`,
        confirmationPrompt:
            typeof input.confirmationPrompt === "string" &&
                input.confirmationPrompt.trim()
                ? input.confirmationPrompt.trim().slice(0, 240)
                : `Would you like me to add ${originLabel} → ${destinationLabel} for ${departureDate} to your watchlist?`,
    }
}

export function cleanLucyPreferredAirportsAction(
    value: unknown,
): LucyPreferredAirportsAction | null {
    if (!value || typeof value !== "object") return null

    const input = value as {
        type?: unknown
        airportCodes?: unknown
        airportCode?: unknown
        confirmationPrompt?: unknown
    }

    if (input.type !== "save_preferred_airports") return null

    const rawAirportCodes = Array.isArray(input.airportCodes)
        ? input.airportCodes
        : input.airportCode
            ? [input.airportCode]
            : []

    const airportCodes = Array.from(
        new Set(
            rawAirportCodes
                .map(cleanAirportCode)
                .filter((code): code is string => Boolean(code)),
        ),
    )

    if (!airportCodes.length) return null

    const airportLabels = airportCodes.map(getAirportDisplayLabel)

    return {
        type: "save_preferred_airports",
        status: "needs_confirmation",
        airportCodes,
        airportLabels,
        confirmationPrompt:
            typeof input.confirmationPrompt === "string" &&
                input.confirmationPrompt.trim()
                ? input.confirmationPrompt.trim().slice(0, 240)
                : `Would you like me to save ${airportLabels.join(
                    " and ",
                )} as preferred airports?`,
    }
}

export function cleanLucySaveFirstNameAction(
    value: unknown,
): LucySaveFirstNameAction | null {
    if (!value || typeof value !== "object") return null

    const input = value as Partial<LucySaveFirstNameAction>

    if (input.type !== "save_first_name") return null

    const firstName =
        typeof input.firstName === "string"
            ? input.firstName.trim().replace(/\s+/g, " ")
            : ""

    if (!firstName || firstName.length > 80) return null

    return {
        type: "save_first_name",
        status: "needs_confirmation",
        firstName,
        confirmationPrompt:
            typeof input.confirmationPrompt === "string" &&
                input.confirmationPrompt.trim()
                ? input.confirmationPrompt.trim().slice(0, 240)
                : `Would you like me to save ${firstName} as your first name for future Skysirv sessions?`,
    }
}

export function cleanLucyPreferredRouteAction(
    value: unknown,
): LucyPreferredRouteAction | null {
    if (!value || typeof value !== "object") return null

    const input = value as Partial<LucyPreferredRouteAction>

    if (input.type !== "save_preferred_route") return null

    const origin = cleanAirportCode(input.origin)
    const destination = cleanAirportCode(input.destination)

    if (!origin || !destination) return null
    if (origin === destination) return null

    const originLabel = getAirportDisplayLabel(origin)
    const destinationLabel = getAirportDisplayLabel(destination)

    return {
        type: "save_preferred_route",
        status: "needs_confirmation",
        origin,
        destination,
        routeLabel:
            typeof input.routeLabel === "string" && input.routeLabel.trim()
                ? input.routeLabel.trim().slice(0, 120)
                : `${originLabel} → ${destinationLabel}`,
        confirmationPrompt:
            typeof input.confirmationPrompt === "string" &&
                input.confirmationPrompt.trim()
                ? input.confirmationPrompt.trim().slice(0, 240)
                : `Would you like me to save ${originLabel} → ${destinationLabel} as a preferred route?`,
    }
}

export function cleanLucySaveVisibleFlightAction(
    value: unknown,
): LucySaveVisibleFlightAction | null {
    if (!value || typeof value !== "object") return null

    const input = value as Partial<LucySaveVisibleFlightAction>

    if (input.type !== "save_visible_flight") return null

    const origin = cleanAirportCode(input.origin)
    const destination = cleanAirportCode(input.destination)

    if (!origin || !destination) return null
    if (origin === destination) return null

    const departureDate =
        typeof input.departureDate === "string" && input.departureDate.trim()
            ? input.departureDate.trim().slice(0, 40)
            : null

    const airline =
        typeof input.airline === "string" && input.airline.trim()
            ? input.airline.trim().toUpperCase().slice(0, 20)
            : null

    const airlineName =
        typeof input.airlineName === "string" && input.airlineName.trim()
            ? input.airlineName.trim().slice(0, 120)
            : null

    const flightNumber =
        typeof input.flightNumber === "string" && input.flightNumber.trim()
            ? input.flightNumber.trim().toUpperCase().slice(0, 40)
            : null

    const price =
        typeof input.price === "number" && Number.isFinite(input.price)
            ? input.price
            : null

    const currency =
        typeof input.currency === "string" && input.currency.trim()
            ? input.currency.trim().toUpperCase().slice(0, 8)
            : "USD"

    const flightLabel =
        typeof input.flightLabel === "string" && input.flightLabel.trim()
            ? input.flightLabel.trim().slice(0, 160)
            : `${airlineName || airline || "Flight"}${flightNumber ? ` ${flightNumber}` : ""
            }`

    return {
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
        confirmationPrompt:
            typeof input.confirmationPrompt === "string" &&
                input.confirmationPrompt.trim()
                ? input.confirmationPrompt.trim().slice(0, 240)
                : `Save ${flightLabel} from ${origin} to ${destination} to your Saved Flights?`,
    }
}

export function cleanLucySaveMemoryAction(
    value: unknown,
): LucySaveMemoryAction | null {
    if (!value || typeof value !== "object") return null

    const input = value as Partial<LucySaveMemoryAction>

    if (input.type !== "save_lucy_memory") return null

    const memoryType =
        typeof input.memoryType === "string" && input.memoryType.trim()
            ? input.memoryType.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 80)
            : "general_travel_note"

    const memoryKey =
        typeof input.memoryKey === "string" && input.memoryKey.trim()
            ? input.memoryKey
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "")
                .slice(0, 120)
            : ""

    const memoryText =
        typeof input.memoryText === "string" && input.memoryText.trim()
            ? input.memoryText.trim().replace(/\s+/g, " ").slice(0, 500)
            : ""

    if (!memoryKey || !memoryText) return null

    return {
        type: "save_lucy_memory",
        status: "needs_confirmation",
        memoryType,
        memoryKey,
        memoryText,
        memoryValueJson: input.memoryValueJson ?? null,
        confirmationPrompt:
            typeof input.confirmationPrompt === "string" &&
                input.confirmationPrompt.trim()
                ? input.confirmationPrompt.trim().slice(0, 240)
                : "Would you like me to remember that for future Skysirv sessions?",
    }
}

export function cleanLucySuggestedAction(value: unknown): LucySuggestedAction | null {
    if (!value || typeof value !== "object") return null

    const input = value as { type?: unknown }

    if (input.type === "add_watchlist_route") {
        return cleanLucyWatchlistAction(value)
    }

    if (input.type === "save_preferred_airports") {
        return cleanLucyPreferredAirportsAction(value)
    }

    if (input.type === "save_preferred_route") {
        return cleanLucyPreferredRouteAction(value)
    }

    if (input.type === "save_first_name") {
        return cleanLucySaveFirstNameAction(value)
    }

    if (input.type === "save_visible_flight") {
        return cleanLucySaveVisibleFlightAction(value)
    }

    if (input.type === "save_lucy_memory") {
        return cleanLucySaveMemoryAction(value)
    }

    return null
}