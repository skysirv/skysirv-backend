import crypto from "node:crypto";

export function createRouteHash(
  origin: string,
  destination: string,
  departureDate: string
): string {
  const normalized = `${origin.trim().toLowerCase()}-${destination
    .trim()
    .toLowerCase()}-${departureDate.trim()}`;

  return crypto.createHash("sha256").update(normalized).digest("hex");
}