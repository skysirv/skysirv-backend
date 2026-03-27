import type { Kysely } from "kysely"
import type { Queue } from "bullmq"
import { QUEUE_NAMES } from "../../infra/queues.js"

export type NormalizedPrice = {
  airline: string
  flightNumber: string
  price: number
  currency: string
}

const EPS = 0.000001

const MIN_VALID_PRICE = 40
const MAX_VALID_PRICE = 5000

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function getCooldownMs(): number {
  const hours = parseNumber(process.env.ALERT_COOLDOWN_HOURS) ?? 0
  if (hours <= 0) return 0
  return hours * 60 * 60 * 1000
}

export async function evaluateAlerts(
  db: Kysely<any>,
  emailQueue: Queue,
  routeHash: string,
  price: NormalizedPrice
): Promise<void> {

  console.log("🔥 evaluateAlerts CALLED", {
    routeHash,
    price: price.price,
  })

  // ============================================
  // BASIC PRICE VALIDATION
  // ============================================

  if (!Number.isFinite(price.price) || price.price <= 0) {
    console.log("⚠️ Invalid price, skipping evaluation")
    return
  }

  if (price.price < MIN_VALID_PRICE || price.price > MAX_VALID_PRICE) {
    console.log("⚠️ Price outside valid range, skipping alert", {
      price: price.price
    })
    return
  }

  const alerts = await db
    .selectFrom("alerts")
    .selectAll()
    .where("route_hash", "=", routeHash)
    .execute()

  console.log("🔎 Alerts found:", alerts.length)

  const cooldownMs = getCooldownMs()

  for (const alert of alerts) {

    let triggered = false

    const threshold =
      alert.threshold_value !== null
        ? Number(alert.threshold_value)
        : null

    const lastTriggered =
      alert.last_triggered_price !== null
        ? Number(alert.last_triggered_price)
        : null

    // =========================================================
    // ABSOLUTE ALERT
    // =========================================================

    if (alert.alert_type === "absolute") {

      if (
        threshold !== null &&
        alert.direction === "below" &&
        price.price < threshold
      ) {

        triggered = true
        console.log("📉 Absolute alert condition met")

      }
    }

    // =========================================================
    // MILESTONE % DROP ALERT
    // =========================================================

    if (alert.alert_type === "pct_drop_milestone") {

      if (threshold === null || threshold <= 0 || threshold > 90) {
        continue
      }

      if (lastTriggered === null) {

        console.log("🧱 Initializing milestone baseline:", price.price)

        await db
          .updateTable("alerts")
          .set({
            last_triggered_price: price.price.toString(),
          })
          .where("id", "=", alert.id)
          .execute()

        continue
      }

      if (price.price >= lastTriggered - EPS) {
        continue
      }

      const triggerPrice = lastTriggered * (1 - threshold / 100)

      if (price.price <= triggerPrice + EPS) {

        triggered = true

        console.log("📉 Milestone drop condition met", {
          baseline: lastTriggered,
          stepPercent: threshold,
          triggerAt: triggerPrice,
          current: price.price,
        })
      }
    }

    if (!triggered) continue

    // =========================================================
    // COOLDOWN CHECK
    // =========================================================

    if (cooldownMs > 0) {

      const lastEvent = await db
        .selectFrom("alert_events")
        .select(["triggered_at"])
        .where("alert_id", "=", alert.id)
        .orderBy("triggered_at", "desc")
        .executeTakeFirst()

      if (lastEvent?.triggered_at) {

        const lastTime = new Date(lastEvent.triggered_at).getTime()
        const now = Date.now()

        const elapsed = now - lastTime

        if (elapsed >= 0 && elapsed < cooldownMs) {

          const remainingMs = cooldownMs - elapsed
          const remainingMin = Math.ceil(remainingMs / 60000)

          console.log("⏳ Cooldown active, skipping alert", {
            alertId: alert.id,
            remainingMin,
          })

          continue
        }
      }
    }

    // =========================================================
    // STRONGER DEDUPLICATION
    // =========================================================

    const existingEvents = await db
      .selectFrom("alert_events")
      .select(["trigger_price"])
      .where("alert_id", "=", alert.id)
      .orderBy("triggered_at", "desc")
      .limit(5)
      .execute()

    const duplicate = existingEvents.some((e: any) => {
      const prev = Number(e.trigger_price)
      return Math.abs(prev - price.price) < 0.5
    })

    if (duplicate) {
      console.log("⛔ Duplicate price alert prevented")
      continue
    }

    console.log("🚨 ALERT TRIGGERED", {
      alertId: alert.id,
      price: price.price,
    })

    await db
      .insertInto("alert_events")
      .values({
        alert_id: alert.id,
        route_hash: routeHash,
        trigger_price: price.price.toString(),
        triggered_at: new Date(),
      })
      .execute()

    await db
      .updateTable("alerts")
      .set({
        last_triggered_price: price.price.toString(),
      })
      .where("id", "=", alert.id)
      .execute()

    await emailQueue.add(QUEUE_NAMES.sendEmail, {
      userId: alert.user_id,
      airline: price.airline,
      price: price.price,
      currency: price.currency,
      routeHash,
    })
  }
}