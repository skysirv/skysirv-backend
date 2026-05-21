export type BookingProvider = "duffel"

export type BookingTripType = "one_way" | "round_trip" | "multi_city"

export type BookingCabinClass =
  | "economy"
  | "premium_economy"
  | "business"
  | "first"

export type BookingSearchSlice = {
  origin: string
  destination: string
  departureDate: string
}

export type BookingSearchInput = {
  provider?: BookingProvider
  tripType: BookingTripType
  origin?: string
  destination?: string
  departureDate?: string
  returnDate?: string | null
  legs?: BookingSearchSlice[]
  adults: number
  children: number
  infants: number
  cabinClass: BookingCabinClass
  maxConnections: number
}

export type ProviderSearchInput = {
  slices: BookingSearchSlice[]
  adults: number
  children: number
  infants: number
  cabinClass: BookingCabinClass
  maxConnections: number
}

export type NormalizedBookingAirport = {
  iataCode: string | null
  name: string | null
  cityName: string | null
}

export type NormalizedBookingSegment = {
  id: string
  airlineName: string | null
  airlineIataCode: string | null
  airlineLogoSymbolUrl: string | null
  airlineLogoLockupUrl: string | null
  flightNumber: string | null
  origin: NormalizedBookingAirport
  destination: NormalizedBookingAirport
  departingAt: string | null
  arrivingAt: string | null
  duration: string | null
  aircraft: string | null
}

export type NormalizedBookingSlice = {
  id: string
  duration: string | null
  origin: NormalizedBookingAirport
  destination: NormalizedBookingAirport
  departureTime: string | null
  arrivalTime: string | null
  stops: number
  segments: NormalizedBookingSegment[]
}

export type NormalizedBookingOffer = {
  id: string
  provider: BookingProvider
  owner: {
    id: string | null
    name: string | null
    iataCode: string | null
  }
  totalAmount: string
  totalCurrency: string
  baseAmount: string | null
  taxAmount: string | null
  expiresAt: string | null
  liveMode: boolean | null
  slices: NormalizedBookingSlice[]
  summary: {
    airlineName: string
    airlineIataCode: string | null
    airlineLogoSymbolUrl: string | null
    airlineLogoLockupUrl: string | null
    flightNumber: string | null
    departureTime: string | null
    arrivalTime: string | null
    duration: string | null
    stops: number
  }
}

export type BookingSearchResult = {
  provider: BookingProvider
  offerRequestId: string
  liveMode: boolean
  passengerIds: string[]
  offers: NormalizedBookingOffer[]
}