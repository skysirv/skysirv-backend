import { db } from "../db/index.js"

export async function getActiveSubscription(userId: string) {
  return db
    .selectFrom("subscriptions")
    .selectAll()
    .where("user_id", "=", userId)
    .where("status", "=", "active")
    .executeTakeFirst()
}

export async function getPlan(planId: string) {
  return db
    .selectFrom("plans")
    .selectAll()
    .where("id", "=", planId)
    .executeTakeFirst()
}

export async function getUserPlan(userId: string) {
  const sub = await getActiveSubscription(userId)

  // No subscription = Free plan
  const planId = sub?.plan_id ?? "free"

  return getPlan(planId)
}

export async function canReceiveAlert(userId: string): Promise<boolean> {

  const plan = await getUserPlan(userId)
  if (!plan) return false

  const alertCount = await db
    .selectFrom("alerts")
    .select((eb) => eb.fn.count("id").as("count"))
    .where("user_id", "=", userId)
    .executeTakeFirst()

  return Number(alertCount?.count ?? 0) <= plan.max_alerts
}

export async function canCreateWatchlist(userId: string): Promise<boolean> {

  const plan = await getUserPlan(userId)
  if (!plan) return false

  const count = await db
    .selectFrom("watchlist")
    .select((eb) => eb.fn.count("id").as("count"))
    .where("user_id", "=", userId)
    .executeTakeFirst()

  return Number(count?.count ?? 0) < plan.max_watchlists
}