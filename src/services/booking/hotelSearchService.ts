import {
  searchRouteStackHotelDestinations,
} from "../../providers/routestack/hotels/routestackHotelDestinations.js"

import {
  searchRouteStackHotels,
  type RouteStackHotelResult,
  type RouteStackHotelRoom,
} from "../../providers/routestack/hotels/routestackHotels.js"

export type HotelSearchInput = {
  destination: string
  checkInDate: string
  checkOutDate: string
  adults: number
  childAges?: number[]
  rooms: number
  freeCancellationOnly?: boolean
}

export type NormalizedHotelSearchResult = {
  id: string
  searchResultId: string
  provider: "routestack"

  accommodationId: string | null

  name: string
  description: string | null

  address: string | null
  cityName: string | null
  countryCode: string | null

  latitude: number | null
  longitude: number | null

  rating: number | null
  reviewScore: number | null
  reviewCount: number | null

  chainName: string | null
  brandName: string | null

  cheapestRateTotalAmount: string
  cheapestRateCurrency: string
  cheapestRatePublicAmount: string | null
  cheapestRatePublicCurrency: string | null

  amenities: string[]
  images: string[]

  checkInDate: string
  checkOutDate: string
  rooms: number

  expiresAt: string | null
}

export type HotelSearchResult = {
  provider: "routestack"
  createdAt: string | null
  results: NormalizedHotelSearchResult[]
}

function buildRooms({
  rooms,
  adults,
  childAges,
}: {
  rooms: number
  adults: number
  childAges: number[]
}): RouteStackHotelRoom[] {
  const baseAdults = Math.floor(adults / rooms)
  const extraAdults = adults % rooms

  const result: RouteStackHotelRoom[] = []

  for (let index = 0; index < rooms; index += 1) {
    result.push({
      adults: baseAdults + (index < extraAdults ? 1 : 0),
      children: 0,
      childAges: [],
    })
  }

  if (result.length === 0) {
    result.push({
      adults,
      children: childAges.length,
      childAges,
    })

    return result
  }

  if (childAges.length > 0) {
    result[0] = {
      ...result[0],
      children: childAges.length,
      childAges,
    }
  }

  return result
}

function normalizeAddress(
  hotel: RouteStackHotelResult,
): string | null {
  const address = hotel.contact?.address

  if (!address) {
    return null
  }

  const parts = [
    address.line1,
    address.city?.name,
    address.country?.name,
  ].filter(
    (value): value is string =>
      typeof value === "string" &&
      value.trim().length > 0,
  )

  return parts.length > 0
    ? parts.join(", ")
    : null
}

function normalizeHotel(
  hotel: RouteStackHotelResult,
  {
    checkInDate,
    checkOutDate,
    rooms,
    currency,
  }: {
    checkInDate: string
    checkOutDate: string
    rooms: number
    currency: string
  },
): NormalizedHotelSearchResult {
  return {
    id: hotel.id,
    searchResultId: hotel.id,
    provider: "routestack",

    accommodationId: hotel.id,

    name: hotel.name,
    description: null,

    address: normalizeAddress(hotel),
    cityName:
      hotel.contact?.address?.city?.name ?? null,
    countryCode:
      hotel.contact?.address?.country?.code ?? null,

    latitude: null,
    longitude: null,

    rating:
      typeof hotel.starRating === "number"
        ? hotel.starRating
        : null,
    reviewScore: null,
    reviewCount: null,

    chainName: hotel.chain ?? null,
    brandName: null,

    cheapestRateTotalAmount:
      String(hotel.ourprice),
    cheapestRateCurrency: currency,

    cheapestRatePublicAmount:
      typeof hotel.publishedRate === "number"
        ? String(hotel.publishedRate)
        : null,

    cheapestRatePublicCurrency:
      typeof hotel.publishedRate === "number"
        ? currency
        : null,

    amenities: [
      ...(hotel.mainamenity ?? []),
      ...(hotel.facilities ?? []).map(
        (facility) => facility.name,
      ),
    ],

    images:
      hotel.heroImage
        ? [hotel.heroImage]
        : [],

    checkInDate,
    checkOutDate,
    rooms,

    expiresAt: null,
  }
}

export async function searchHotels(
  input: HotelSearchInput,
): Promise<HotelSearchResult> {
  const childAges =
    input.childAges ?? []

  const destinationResult =
    await searchRouteStackHotelDestinations({
      query: input.destination,
    })

  if (
    !destinationResult ||
    typeof destinationResult !== "object" ||
    !("result" in destinationResult) ||
    !Array.isArray(destinationResult.result)
  ) {
    throw new Error(
      "RouteStack hotel destination search returned no usable results",
    )
  }

  const destination =
    destinationResult.result.find(
      (item: any) =>
        item?.type === "City",
    ) ??
    destinationResult.result[0]

  if (!destination) {
    throw new Error(
      "RouteStack could not resolve the hotel destination",
    )
  }

  const coordinates =
    destination.coordinates ?? null

  const hotelRooms = buildRooms({
    rooms: input.rooms,
    adults: input.adults,
    childAges,
  })

  const hotelResult =
    await searchRouteStackHotels({
      city:
        typeof destination.fullName === "string"
          ? destination.fullName
          : input.destination,

      destinationId:
        typeof destination.id === "string"
          ? destination.id
          : undefined,

      lat:
        typeof coordinates?.lat === "number"
          ? coordinates.lat
          : undefined,

      long:
        typeof coordinates?.long === "number"
          ? coordinates.long
          : undefined,

      checkIn: input.checkInDate,
      checkOut: input.checkOutDate,

      roomCount: input.rooms,
      rooms: hotelRooms,
    })

  const currency =
    hotelResult.result?.currency ?? "USD"

  let hotels =
    hotelResult.result?.result ?? []

  if (input.freeCancellationOnly) {
    hotels = hotels.filter(
      (hotel) =>
        hotel.options?.freeCancellation === true,
    )
  }

  return {
    provider: "routestack",
    createdAt: null,

    results: hotels.map((hotel) =>
      normalizeHotel(hotel, {
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        rooms: input.rooms,
        currency,
      }),
    ),
  }
}