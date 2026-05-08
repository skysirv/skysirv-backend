import { searchDuffelOffers } from "./providers/duffelProvider.js"
import type {
  BookingSearchInput,
  BookingSearchSlice,
  BookingSearchResult,
  ProviderSearchInput,
} from "./types.js"

function normalizeSlice(slice: BookingSearchSlice): BookingSearchSlice {
  return {
    origin: slice.origin.trim().toUpperCase(),
    destination: slice.destination.trim().toUpperCase(),
    departureDate: slice.departureDate,
  }
}

function buildSearchSlices(input: BookingSearchInput): BookingSearchSlice[] {
  if (input.tripType === "multi_city") {
    return (input.legs ?? []).map(normalizeSlice)
  }

  if (!input.origin || !input.destination || !input.departureDate) {
    throw new Error("Origin, destination, and departure date are required")
  }

  const slices: BookingSearchSlice[] = [
    {
      origin: input.origin,
      destination: input.destination,
      departureDate: input.departureDate,
    },
  ].map(normalizeSlice)

  if (input.tripType === "round_trip" && input.returnDate) {
    slices.push(
      normalizeSlice({
        origin: input.destination,
        destination: input.origin,
        departureDate: input.returnDate,
      })
    )
  }

  return slices
}

export async function searchBookingOffers(
  input: BookingSearchInput
): Promise<BookingSearchResult> {
  const provider = input.provider ?? "duffel"

  const providerInput: ProviderSearchInput = {
    slices: buildSearchSlices(input),
    adults: input.adults,
    cabinClass: input.cabinClass,
    maxConnections: input.maxConnections,
  }

  if (provider === "duffel") {
    return searchDuffelOffers(providerInput)
  }

  throw new Error(`Unsupported booking provider: ${provider}`)
}