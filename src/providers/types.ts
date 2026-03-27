export interface FlightResult {
  airline: string
  flightNumber: string

  // Optional because some providers don't return them
  departureTime?: string
  arrivalTime?: string

  price: number
  currency: string
}

export interface FlightSearchParams {
  origin: string
  destination: string
  departureDate: string
}

export interface FlightProvider {
  searchFlights(params: FlightSearchParams): Promise<FlightResult[]>
}