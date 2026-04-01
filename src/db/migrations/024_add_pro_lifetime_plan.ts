import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
    await db
        .insertInto("plans")
        .values({
            id: "pro_lifetime",
            name: "Pro Lifetime",
            max_watchlists: 25,
            max_alerts: 100,
            price_monthly: 0,
            stripe_price_id: null,
        })
        .onConflict((oc) => oc.column("id").doNothing())
        .execute()
}