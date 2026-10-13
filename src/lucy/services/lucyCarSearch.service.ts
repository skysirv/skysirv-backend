import {
  searchRouteStackCarLocations,
} from "../../providers/routestack/cars/routestackCarLocations.js"

import {
  searchRouteStackCars,
  type RouteStackCarResult,
} from "../../providers/routestack/cars/routestackCars.js"

export type LucyCarSearchInput = {
  pickupLocation: string
  dropoffLocation: string
  pickupDate: string
  dropoffDate: string
  pickupTime?: string
  dropoffTime?: string
  driverAge?: number | null
  maxResults?: number
}

type NormalizedCarLocation = {
  code: string
  name: string | null
  type: string | null
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

function validateTime(
  value: string,
  fieldName: string,
) {
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(
      value,
    )
  ) {
    throw new Error(
      `${fieldName} must use HH:MM format`,
    )
  }
}

function extractLocationCandidates(
  value: unknown,
): unknown[] {
  if (Array.isArray(value)) {
    return value
  }

  if (
    !value ||
    typeof value !== "object"
  ) {
    return []
  }

  const object =
    value as Record<string, unknown>

  const possibleArrays = [
    object.result,
    object.results,
    object.locations,
    object.data,
  ]

  for (const candidate of possibleArrays) {
    if (Array.isArray(candidate)) {
      return candidate
    }

    if (
      candidate &&
      typeof candidate === "object"
    ) {
      const nested =
        candidate as Record<
          string,
          unknown
        >

      const nestedArrays = [
        nested.result,
        nested.results,
        nested.locations,
        nested.data,
      ]

      for (
        const nestedCandidate
        of nestedArrays
      ) {
        if (
          Array.isArray(
            nestedCandidate,
          )
        ) {
          return nestedCandidate
        }
      }
    }
  }

  return []
}

function normalizeLocationCandidate(
  value: unknown,
): NormalizedCarLocation | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null
  }

  const location =
    value as Record<string, unknown>

  const codeCandidates = [
    location.code,
    location.location_code,
    location.locationCode,
    location.airport_code,
    location.airportCode,
    location.iata,
    location.iataCode,
  ]

  const code =
    codeCandidates.find(
      (candidate) =>
        typeof candidate === "string" &&
        candidate.trim(),
    )

  if (typeof code !== "string") {
    return null
  }

  const normalizedCode =
    code.trim().toUpperCase()

  if (!normalizedCode) {
    return null
  }

  const nameCandidate =
    [
      location.name,
      location.label,
      location.location,
      location.airport_name,
      location.airportName,
    ].find(
      (candidate) =>
        typeof candidate === "string" &&
        candidate.trim(),
    )

  const typeCandidate =
    [
      location.type,
      location.location_type,
      location.locationType,
    ].find(
      (candidate) =>
        typeof candidate === "string" &&
        candidate.trim(),
    )

  return {
    code: normalizedCode,
    name:
      typeof nameCandidate === "string"
        ? nameCandidate.trim()
        : null,
    type:
      typeof typeCandidate === "string"
        ? typeCandidate.trim()
        : null,
  }
}

async function resolveCarLocation(
  query: string,
): Promise<NormalizedCarLocation> {
  const trimmedQuery =
    query.trim()

  if (!trimmedQuery) {
    throw new Error(
      "Car location is required",
    )
  }

  if (
    /^[A-Za-z]{3}$/.test(
      trimmedQuery,
    )
  ) {
    return {
      code:
        trimmedQuery.toUpperCase(),
      name: null,
      type: null,
    }
  }

  const response =
    await searchRouteStackCarLocations({
      term: trimmedQuery,
    })

  const candidates =
    extractLocationCandidates(
      response,
    )
      .map(
        normalizeLocationCandidate,
      )
      .filter(
        (
          candidate,
        ): candidate is NormalizedCarLocation =>
          candidate !== null,
      )

  if (candidates.length === 0) {
    throw new Error(
      `No RouteStack car location found for "${trimmedQuery}"`,
    )
  }

  const airportMatch =
    candidates.find(
      (candidate) =>
        candidate.type
          ?.toLowerCase()
          .includes("airport"),
    )

  return (
    airportMatch ??
    candidates[0]
  )
}

function getCarPrice(
  car: RouteStackCarResult,
) {
  const postpaid =
    car.price_postpaid?.total

  if (
    typeof postpaid === "number" &&
    Number.isFinite(postpaid)
  ) {
    return postpaid
  }

  const prepaid =
    car.price_prepaid?.total

  if (
    typeof prepaid === "number" &&
    Number.isFinite(prepaid)
  ) {
    return prepaid
  }

  if (
    typeof car.display_price === "number" &&
    Number.isFinite(
      car.display_price,
    )
  ) {
    return car.display_price
  }

  return Number.POSITIVE_INFINITY
}

function getPreferredPrice(
  car: RouteStackCarResult,
) {
  if (car.price_postpaid) {
    return {
      mode: "postpaid" as const,
      ...car.price_postpaid,
    }
  }

  if (car.price_prepaid) {
    return {
      mode: "prepaid" as const,
      ...car.price_prepaid,
    }
  }

  return null
}

export async function searchLucyCars(
  input: LucyCarSearchInput,
) {
  const pickupLocation =
    input.pickupLocation.trim()

  const dropoffLocation =
    input.dropoffLocation.trim()

  if (
    !pickupLocation ||
    !dropoffLocation
  ) {
    throw new Error(
      "Car pickup and dropoff locations are required",
    )
  }

  validateIsoDate(
    input.pickupDate,
    "Car pickup date",
  )

  validateIsoDate(
    input.dropoffDate,
    "Car dropoff date",
  )

  if (
    input.dropoffDate <
    input.pickupDate
  ) {
    throw new Error(
      "Car dropoff date cannot be before pickup date",
    )
  }

  const pickupTime =
    input.pickupTime ?? "10:00"

  const dropoffTime =
    input.dropoffTime ?? "10:00"

  validateTime(
    pickupTime,
    "Car pickup time",
  )

  validateTime(
    dropoffTime,
    "Car dropoff time",
  )

  const maxResults =
    Math.min(
      Math.max(
        input.maxResults ?? 5,
        1,
      ),
      8,
    )

  const [
    resolvedPickup,
    resolvedDropoff,
  ] =
    await Promise.all([
      resolveCarLocation(
        pickupLocation,
      ),
      resolveCarLocation(
        dropoffLocation,
      ),
    ])

  const result =
    await searchRouteStackCars({
      pickup:
        resolvedPickup.code,

      dropoff:
        resolvedDropoff.code,

      pickupDate:
        input.pickupDate,

      dropoffDate:
        input.dropoffDate,

      pickupTime,
      dropoffTime,

      ...(input.driverAge
        ? {
          driverAge:
            input.driverAge,
        }
        : {}),
    })

  const cars =
    result.result?.cars ?? []

  const matchingCars =
    [...cars]
      .sort(
        (a, b) =>
          getCarPrice(a) -
          getCarPrice(b),
      )
      .slice(
        0,
        maxResults,
      )

  return {
    provider: "routestack" as const,

    correlationId:
      result.correlationId ??
      null,

    pickupLocation: {
      query:
        pickupLocation,
      code:
        resolvedPickup.code,
      name:
        resolvedPickup.name,
      type:
        resolvedPickup.type,
    },

    dropoffLocation: {
      query:
        dropoffLocation,
      code:
        resolvedDropoff.code,
      name:
        resolvedDropoff.name,
      type:
        resolvedDropoff.type,
    },

    pickupDate:
      input.pickupDate,

    dropoffDate:
      input.dropoffDate,

    pickupTime,
    dropoffTime,

    cars:
      matchingCars.map(
        (car) => {
          const price =
            getPreferredPrice(
              car,
            )

          return {
            name:
              car.name,

            description:
              car.description ??
              null,

            type:
              car.type_name ??
              car.type ??
              null,

            vehicleCode:
              car.vehicle_code ??
              null,

            passengers:
              car.passengers ??
              null,

            bags:
              car.bags ??
              null,

            doors:
              car.doors ??
              null,

            automatic:
              typeof car.hasAMT ===
                "boolean"
                ? car.hasAMT
                : car.manual_transmission ===
                  true
                  ? false
                  : null,

            airConditioning:
              car.hasAC ??
              null,

            fuelType:
              car.fuelType ??
              null,

            supplierName:
              car.partner?.name ??
              null,

            supplierCode:
              car.partner?.code ??
              null,

            supplierLogo:
              car.partner?.logo ??
              null,

            image:
              car.heroImage ??
              null,

            totalAmount:
              price?.total ??
              null,

            currency:
              price?.currency ??
              result.result
                ?.currency ??
              null,

            paymentMode:
              price?.mode ??
              null,

            payAtBooking:
              price
                ?.pay_at_booking ??
              null,

            freeCancellation:
              price
                ?.free_cancellation ??
              null,

            mileageIncluded:
              price?.mileage ??
              car.mileage ??
              null,

            fareCode:
              price?.fareCode ??
              null,

            features:
              car.features ??
              [],

            inclusions:
              car.inclusions ??
              [],

            pickup:
              car.pickup ??
              null,

            dropoff:
              car.dropoff ??
              null,
          }
        },
      ),
  }
}