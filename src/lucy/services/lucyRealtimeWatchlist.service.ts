import { getUserWatchlist } from "../../db/watchlist.js"
import { type FlightAttendantDashboardRouteContext } from "../models/flightAttendant.types.js"

export async function getRealtimeWatchlistRoutes(
    userId: string,
    dashboardRoutesFromBody: FlightAttendantDashboardRouteContext[],
): Promise<FlightAttendantDashboardRouteContext[]> {
    if (dashboardRoutesFromBody.length > 0) {
        return dashboardRoutesFromBody
    }

    return (await getUserWatchlist(userId)).slice(0, 12).map((route) => ({
        id: route.id,
        origin: route.origin,
        destination: route.destination,
        departureDate:
            route.departure_date instanceof Date
                ? route.departure_date.toISOString().slice(0, 10)
                : route.departure_date
                    ? String(route.departure_date)
                    : null,
        routeLabel: `${route.origin} → ${route.destination}`,
        latestPrice: route.latest_price ?? null,
        averagePrice: route.avg_price ? Number(route.avg_price) / 100 : null,
        bookingSignal: route.booking_signal ?? null,
        recommendedFlights: Array.isArray(route.recommended_flights)
            ? route.recommended_flights.slice(0, 8).map((flight: any) => ({
                airline: flight.airline ?? null,
                airlineName: flight.airlineName ?? null,
                airlineLogoSymbolUrl: flight.airlineLogoSymbolUrl ?? null,
                airlineLogoLockupUrl: flight.airlineLogoLockupUrl ?? null,
                flightNumber: flight.flightNumber ?? null,
                price:
                    typeof flight.price === "number" && Number.isFinite(flight.price)
                        ? flight.price
                        : null,
                currency: flight.currency ?? null,
                stopCount:
                    typeof flight.stopCount === "number" && Number.isFinite(flight.stopCount)
                        ? flight.stopCount
                        : null,
            }))
            : [],
    }))
}