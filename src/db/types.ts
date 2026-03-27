export interface UsersTable {
  id: string
  provider: string
  provider_id: string
  email: string
  password: string
  created_at: Date
  stripe_customer_id: string | null
  is_admin: boolean
  is_verified: boolean
}

export interface EmailVerificationTokensTable {
  id: string
  user_id: string
  token: string
  expires_at: Date
  used: boolean
  created_at: Date
}

export interface PlansTable {
  id: string
  name: string
  max_watchlists: number
  max_alerts: number
  price_monthly: number
  stripe_price_id: string | null
  created_at: Date
}

export interface SubscriptionsTable {
  id?: string
  user_id: string
  plan_id: string
  status: string
  billing_interval: string | null
  current_period_end: Date | null
  created_at?: Date
  stripe_subscription_id: string | null
}

export interface WatchlistTable {
  id?: string
  user_id: string
  route_hash: string
  origin: string
  destination: string
  departure_date: Date
  is_active: boolean
  created_at?: Date
  last_checked_at: Date | null
}

export interface AlertsTable {
  id?: number
  user_id: string
  route_hash: string
  alert_type: string
  threshold_value: number | null
  direction: string | null
  last_triggered_price: number | null
  watchlist_id: number | null
  created_at?: Date
}

export interface AlertEventsTable {
  id: string
  alert_id: number
  route_hash: string
  trigger_price: number
  triggered_at: Date
}

export interface FlightPriceHistoryTable {
  id?: string
  route_hash: string
  origin: string
  destination: string
  departure_date: Date
  airline: string
  flight_number: string
  price: number
  currency: string
  skyscore: number | null
  booking_signal: string | null
  volatility_index: string | null
  captured_at?: Date
}

export interface RouteIntelligenceTable {
  route_hash: string
  median_price: number | null
  volatility_index: number | null
  trend: number | null
  momentum: number | null
  history_depth: number | null
  last_updated: Date | null
}

export interface TripsTable {
  id: string
  user_id: string
  title: string | null
  booking_reference: string | null
  trip_type: string
  started_at: Date | null
  ended_at: Date | null
  origin_airport_code: string | null
  destination_airport_code: string | null
  status: string
  created_at: Date
  updated_at: Date
}

export interface TripSegmentsTable {
  id: string
  trip_id: string
  user_id: string
  segment_order: number
  airline_code: string | null
  flight_number: string | null
  departure_airport_code: string
  departure_terminal: string | null
  departure_gate: string | null
  scheduled_departure_at: Date | null
  actual_departure_at: Date | null
  arrival_airport_code: string
  arrival_terminal: string | null
  arrival_gate: string | null
  scheduled_arrival_at: Date | null
  actual_arrival_at: Date | null
  cabin_class: string | null
  fare_class: string | null
  aircraft_type: string | null
  distance_km: number | null
  status: string
  source: string | null
  created_at: Date
  updated_at: Date
}

export interface StripeEventsTable {
  id: string
  type: string
  created_at: Date
}

export interface UserIntelligenceWrappedTable {
  id: string
  user_id: string
  year: number
  status: string
  flights: number
  countries: number
  distance_km: number
  skyscore_avg: number | null
  savings_total: number
  avg_savings: number
  beat_market_pct: number
  routes_monitored: number
  alerts_triggered: number
  alerts_won: number
  traveler_identity: string | null
  wrapped_payload_json: unknown | null
  generated_at: Date | null
  created_at: Date
  updated_at: Date
}

export interface Database {
  users: UsersTable
  email_verification_tokens: EmailVerificationTokensTable
  plans: PlansTable
  subscriptions: SubscriptionsTable
  watchlist: WatchlistTable
  alerts: AlertsTable
  alert_events: AlertEventsTable
  flight_price_history: FlightPriceHistoryTable
  route_intelligence: RouteIntelligenceTable
  trips: TripsTable
  trip_segments: TripSegmentsTable
  user_intelligence_wrapped: UserIntelligenceWrappedTable
  stripe_events: StripeEventsTable
  monitored_routes: any
  user_monitors: any
  invite_tokens: any
}

export type DB = Database