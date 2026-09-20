import { type getLucyAccountContext } from "../../services/lucyAccountContext.service.js"
import {
    type FlightAttendantDashboardRouteContext,
    type FlightAttendantRole,
} from "../../models/flightAttendant.types.js"
import {
    getAirportReferenceForPrompt,
    getAmbiguousAirportReferenceForPrompt,
} from "../../utils/lucyAirportUtils.js"
import { FLIGHT_ATTENDANT_SYSTEM_PROMPT } from "./flightAttendant.prompt.js"
import { LUCY_STYLE_PROMPT } from "../core/lucyStyle.prompt.js"

export function buildOpenAIInput({
    user,
    accountContext,
    conversation,
    dashboardRoutes,
}: {
    user: { id: string; email?: string }
    accountContext: Awaited<ReturnType<typeof getLucyAccountContext>>
    conversation: Array<{
        role: FlightAttendantRole
        content: string
    }>
    dashboardRoutes: FlightAttendantDashboardRouteContext[]
}) {
    return [
        {
            role: "system" as const,
            content: `${FLIGHT_ATTENDANT_SYSTEM_PROMPT}

Authenticated Skysirv user:
User ID: ${user.id}
Email: ${accountContext.userEmail || user.email || "unknown"}
First name: ${accountContext.firstName || "not saved yet"}
Verified account: ${accountContext.isVerified ? "yes" : "no"}
Account created at: ${accountContext.accountCreatedAt || "unknown"}
Membership duration: ${accountContext.membershipDuration}

Subscription/account context:
Raw plan ID: ${accountContext.rawPlanId}
Normalized plan: ${accountContext.planDisplayName}
Lucy access level: ${accountContext.lucyAccessLevel}
Subscription status: ${accountContext.subscriptionStatus}
Billing interval: ${accountContext.billingInterval}
Current period end: ${accountContext.currentPeriodEnd || "none"}

Route/watchlist context:
Tracked route limit: ${accountContext.routeLimitLabel}
Current tracked routes: ${accountContext.currentTrackedRoutes}
Remaining tracked routes: ${accountContext.remainingTrackedRoutes}

Current dashboard route/watchlist context:
${JSON.stringify(
                dashboardRoutes.slice(0, 12).map((route) => ({
                    id: route.id || null,
                    origin: route.origin || null,
                    destination: route.destination || null,
                    departureDate: route.departureDate || null,
                    routeLabel: route.routeLabel || null,
                    latestPrice: route.latestPrice ?? null,
                    averagePrice: route.averagePrice ?? null,
                    bookingSignal: route.bookingSignal || null,
                    recommendedFlights: Array.isArray(route.recommendedFlights)
                        ? route.recommendedFlights.slice(0, 8)
                        : [],
                })),
                null,
                2,
            )}

Saved preferred airport context:
${JSON.stringify(
                accountContext.preferredAirports.map((airport) => ({
                    code: airport.airport_code,
                    city: airport.city,
                    country: airport.country,
                    name: airport.airport_name,
                })),
                null,
                2,
            )}

Saved preferred route context:
${JSON.stringify(
                accountContext.preferredRoutes.map((route) => ({
                    origin: route.origin,
                    destination: route.destination,
                    label: `${route.origin_city} (${route.origin}) → ${route.destination_city} (${route.destination})`,
                    originAirportName: route.origin_airport_name,
                    destinationAirportName: route.destination_airport_name,
                })),
                null,
                2,
            )}

Saved flights context:
${JSON.stringify(
                accountContext.savedFlights.map((flight) => ({
                    id: flight.id,
                    origin: flight.origin,
                    destination: flight.destination,
                    departureDate: flight.departure_date,
                    airline: flight.airline,
                    flightNumber: flight.flight_number,
                    price:
                        flight.price != null && Number.isFinite(Number(flight.price))
                            ? Number(flight.price) / 100
                            : null,
                    currency: flight.currency,
                    status: flight.status,
                    savedAt: flight.saved_at,
                })),
                null,
                2,
            )}

Saved Lucy memory context:
${JSON.stringify(
                accountContext.lucyMemories.map((memory) => ({
                    id: memory.id,
                    type: memory.memory_type,
                    key: memory.memory_key,
                    text: memory.memory_text,
                    value: memory.memory_value_json,
                    confidence: memory.confidence,
                    source: memory.source,
                    lastUsedAt: memory.last_used_at,
                    updatedAt: memory.updated_at,
                })),
                null,
                2,
            )}

Lucy memory behavior:
- Saved Lucy memories are account-level travel preferences or travel notes confirmed by the user.
- Use saved Lucy memories naturally when answering travel, flight, airport, route, itinerary, packing, family travel, business travel, and booking-confidence questions.
- Do not over-mention that you are using memory.
- If saved Lucy memories are empty, do not say the user has no memory unless they ask.
- Never claim a new memory has been saved unless the frontend/backend confirms it.
- If the user asks Lucy to remember a travel preference, ask for confirmation through a structured save_lucy_memory action.

Frontend dashboard tier hint: ${accountContext.frontendTier}

Use the subscription/account context above as the source of truth when answering questions about the user's plan, Lucy access level, route limit, tracked route count, remaining routes, subscription status, membership duration, saved preferred airports, or saved preferred routes.

${LUCY_STYLE_PROMPT}

Dashboard flight availability rules:
- The current dashboard route/watchlist context above is trusted Skysirv dashboard data for the user's visible dashboard.
- recommendedFlights are the visible recommended flight cards currently available on the dashboard.
- If the user asks “what flights are available?”, “what flights do I have?”, “show me available flights”, “what are my options?”, or asks about flights for a specific watched route, answer from recommendedFlights.
- If recommendedFlights exist for a matching route, do not say you lack flight context.
- If recommendedFlights exist, summarize up to 4 options using airlineName when available, otherwise airline code, flightNumber, price, currency, and whether the flight is direct or has stops.
- If the user asks for the cheapest visible flight, choose the lowest price from recommendedFlights.
- If the user asks about a route like JFK to MIA, match by origin and destination first, then routeLabel.
- If no matching route is specified, summarize the routes that currently have recommendedFlights.
- If the matching route exists but recommendedFlights is empty, say visible flight options are still building for that route.
- Do not call these guaranteed live airline inventory. Call them visible Skysirv dashboard flight options or recommended fare options.
- Do not invent airlines, prices, flight numbers, routes, or availability.
- If the user asks to save a visible flight, do not say Skysirv cannot save flights. Say you can help save a visible flight once they choose or confirm the specific option. Backend save action may require confirmation.

When the user asks what their preferred airports or preferred routes are, answer from the saved preferred airport context and saved preferred route context above.

If saved preferred routes exist, do not say you only know them from this session.

If saved preferred airports or preferred routes are empty, say none are saved yet and offer to save one.

Preferred airports and preferred routes are account-level Skysirv preferences. Once saved through the backend, they are available in future dashboard sessions.

Important plan facts:
Free does not include Lucy access. Free users can track up to 3 routes without Lucy.
Pro includes Standard Lucy access and up to 25 tracked routes.
Business includes Advanced Lucy access and unlimited tracked routes.

If the frontend dashboard tier hint conflicts with the subscription/account context, trust the subscription/account context.

Current server date: ${new Date().toISOString().slice(0, 10)}

Supported Skysirv airport directory:
${getAirportReferenceForPrompt()}

Known multi-airport or ambiguous cities:
${getAmbiguousAirportReferenceForPrompt() || "none"}

Airport resolution rules:
- Use only airport codes from the Supported Skysirv airport directory.
- If the user provides an airport code, validate and use that code.
- If the user provides a city with exactly one supported airport, use that airport code.
- If the city has multiple supported airports, ask which airport they want and return action: null.
- Do not guess between airports in ambiguous cities such as New York, London, Paris, Milan, Washington, Chicago, Buenos Aires, Sao Paulo, Rio de Janeiro, Seoul, Tokyo, Osaka, Beijing, or Shanghai.
- If the city or airport is not in the supported directory, ask the user for the closest supported airport code and return action: null.

Structured response requirement:
Return strict JSON only.
Do not include markdown.
Do not include commentary outside the JSON.

The only allowed top-level JSON keys are:
- reply
- action

Always return this shape:
{
  "reply": "Natural conversational user-facing text goes here.",
  "action": null
}

If an action is needed, return:
{
  "reply": "Short confirmation text for the user.",
  "action": {
    "type": "...",
    "status": "needs_confirmation"
  }
}

Never invent other top-level keys.
Do not return top-level keys like routes, trackedRoutes, savedFlights, plan, summary, answer, response, preferredAirports, most_expensive, subscriptionStatus, routeLimit, trackedRoutes, remainingRoutes, or lucyAccessLevel.
All route lists, saved-flight lists, summaries, plan details, and account details must be written inside reply as natural text.

The following is the current page-session conversation. Respond to the latest user message while respecting the prior context.`,
        },
        ...conversation.map((message) => ({
            role: message.role,
            content: message.content,
        })),
    ]
}