import {
  searchHotels,
  type NormalizedHotelSearchResult,
} from "../../services/booking/hotelSearchService.js"

import {
  geocodeLocation,
  type GeocodedLocation,
} from "../../services/geocoding/mapboxGeocoding.service.js"

export type LucyHotelSearchInput = {
  destination: string
  checkInDate: string
  checkOutDate: string
  adults?: number
  childAges?: number[]
  rooms?: number
  radiusKm?: number
  freeCancellationOnly?: boolean
  maxResults?: number
}

function getStayPrice(
  stay: NormalizedHotelSearchResult,
) {
  const value = Number(
    stay.cheapestRateTotalAmount,
  )

  return Number.isFinite(value)
    ? value
    : Number.POSITIVE_INFINITY
}

function validateIsoDate(
  value: string,
  fieldName: string,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new Error(
      `${fieldName} must use YYYY-MM-DD format`,
    )
  }
}

function validateStayDates(
  checkInDate: string,
  checkOutDate: string,
) {
  validateIsoDate(
    checkInDate,
    "Hotel check-in date",
  )

  validateIsoDate(
    checkOutDate,
    "Hotel check-out date",
  )

  if (checkOutDate <= checkInDate) {
    throw new Error(
      "Hotel check-out date must be after the check-in date",
    )
  }
}

function normalizeChildAges(
  childAges?: number[],
) {
  if (!childAges) {
    return []
  }

  return childAges.map((age) => {
    if (
      !Number.isInteger(age) ||
      age < 0
    ) {
      throw new Error(
        "Hotel child ages must be non-negative whole numbers",
      )
    }

    return age
  })
}

function normalizeLocationForResponse(
  location: GeocodedLocation,
) {
  return {
    query: location.query,
    name: location.name,
    formattedAddress:
      location.formattedAddress,
    latitude: location.latitude,
    longitude: location.longitude,
    featureType: location.featureType,
  }
}

export async function searchLucyHotels(
  input: LucyHotelSearchInput,
) {
  const destination =
    input.destination.trim()

  if (!destination) {
    throw new Error(
      "Hotel destination is required",
    )
  }

  validateStayDates(
    input.checkInDate,
    input.checkOutDate,
  )

  const adults =
    input.adults ?? 1

  if (
    !Number.isInteger(adults) ||
    adults < 1
  ) {
    throw new Error(
      "Hotel search requires at least one adult",
    )
  }

  const rooms =
    input.rooms ?? 1

  if (
    !Number.isInteger(rooms) ||
    rooms < 1
  ) {
    throw new Error(
      "Hotel search requires at least one room",
    )
  }

  const childAges =
    normalizeChildAges(
      input.childAges,
    )

  const maxResults = Math.min(
    Math.max(
      input.maxResults ?? 5,
      1,
    ),
    8,
  )

  const location =
    await geocodeLocation(destination)

  const result =
    await searchHotels({
      destination,
      checkInDate:
        input.checkInDate,
      checkOutDate:
        input.checkOutDate,
      adults,
      childAges,
      rooms,
      freeCancellationOnly:
        input.freeCancellationOnly ??
        false,
    })

  const matchingStays =
    result.results
      .sort(
        (a, b) =>
          getStayPrice(a) -
          getStayPrice(b),
      )
      .slice(0, maxResults)

  return {
    provider: result.provider,

    destination:
      normalizeLocationForResponse(
        location,
      ),

    checkInDate:
      input.checkInDate,

    checkOutDate:
      input.checkOutDate,

    adults,
    childAges,
    rooms,

    hotels:
      matchingStays.map(
        (stay) => ({
          searchResultId:
            stay.searchResultId,

          accommodationId:
            stay.accommodationId,

          name:
            stay.name,

          description:
            stay.description,

          address:
            stay.address,

          cityName:
            stay.cityName,

          countryCode:
            stay.countryCode,

          latitude:
            stay.latitude,

          longitude:
            stay.longitude,

          rating:
            stay.rating,

          reviewScore:
            stay.reviewScore,

          reviewCount:
            stay.reviewCount,

          chainName:
            stay.chainName,

          brandName:
            stay.brandName,

          totalAmount:
            stay.cheapestRateTotalAmount,

          totalCurrency:
            stay.cheapestRateCurrency,

          publicAmount:
            stay.cheapestRatePublicAmount,

          publicCurrency:
            stay.cheapestRatePublicCurrency,

          amenities:
            stay.amenities,

          images:
            stay.images,

          expiresAt:
            stay.expiresAt,
        }),
      ),
  }
}