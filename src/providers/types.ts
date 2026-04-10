export interface FlightSegment {
  origin: string
  destination: string

  marketingCarrier?: string
  operatingCarrier?: string

  marketingFlightNumber?: string
  operatingFlightNumber?: string

  departureTime?: string
  arrivalTime?: string
}

export interface FlightResult {
  airline: string
  flightNumber: string

  // Optional because some providers don't return them
  departureTime?: string
  arrivalTime?: string

  price: number
  currency: string

  /*
  --------------------------------
  Global itinerary realism fields
  --------------------------------
  */

  marketingCarrier?: string
  operatingCarrier?: string

  stopCount?: number
  totalDurationMinutes?: number

  /*
  --------------------------------
  Used to collapse duplicate offers
  that are the same trip shape but
  have different fare packaging
  --------------------------------
  */
  itineraryKey?: string

  /*
  --------------------------------
  Full segment structure so we can
  rank for realism and quality
  --------------------------------
  */
  segments?: FlightSegment[]
}

export interface FlightSearchParams {
  origin: string
  destination: string
  departureDate: string
}

export interface FlightProvider {
  searchFlights(params: FlightSearchParams): Promise<FlightResult[]>
}