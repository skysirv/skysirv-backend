export type MonitorJobData = {
  routeKey: string; // canonical route key
  origin: string;
  destination: string;
  departureDate: string; // YYYY-MM-DD
  cabin?: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST";
  currency?: string;
};