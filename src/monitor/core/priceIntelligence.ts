import type { Kysely } from "kysely"

export type PriceInsight = {
  median: number | null
  dealLevel: "deal" | "good" | "normal" | "expensive" | "unknown"
}

function median(values: number[]): number {
  if (values.length === 0) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }

  return sorted[mid]
}

export async function computePriceInsight(
  db: Kysely<any>,
  routeHash: string,
  currentPrice: number
): Promise<PriceInsight> {

  const rows = await db
    .selectFrom("flight_price_history")
    .select(["price"])
    .where("route_hash", "=", routeHash)
    .orderBy("captured_at", "desc")
    .limit(50)
    .execute()

  const prices = rows.map((r: any) => Number(r.price)).filter(Number.isFinite)

  if (prices.length < 5) {
    return {
      median: null,
      dealLevel: "unknown",
    }
  }

  const med = median(prices)

  const ratio = currentPrice / med

  let dealLevel: PriceInsight["dealLevel"]

  if (ratio <= 0.75) dealLevel = "deal"
  else if (ratio <= 0.9) dealLevel = "good"
  else if (ratio <= 1.1) dealLevel = "normal"
  else dealLevel = "expensive"

  return {
    median: Number((med / 100).toFixed(2)),
    dealLevel,
  }
}