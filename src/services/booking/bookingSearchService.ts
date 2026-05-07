import { searchDuffelOffers } from "./providers/duffelProvider.js"
import type {
  BookingSearchInput,
  BookingSearchSlice,
  BookingSearchResult,
  ProviderSearchInput,
} from "./types.js"

function buildSearchSlices(input: BookingSearchInput): BookingSearchSlice[] {
  const slices: BookingSearchSlice[] = [
    {
      origin: input.origin,
      destination: input.destination,
      departureDate: input.departureDate,
    },
  ]

  if (input.tripType === "round_trip" && input.returnDate) {
    slices.push({
      origin: input.destination,
      destination: input.origin,
      departureDate: input.returnDate,
    })
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