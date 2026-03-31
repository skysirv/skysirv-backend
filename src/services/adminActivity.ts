import type { Kysely, Transaction } from "kysely"
import type { Database } from "../db/types.js"

type DBLike = Kysely<Database> | Transaction<Database>

export async function logAdminActivity(
    db: DBLike,
    message: string
): Promise<void> {
    const trimmed = message.trim()

    if (!trimmed) return

    await db
        .insertInto("admin_activity")
        .values({
            message: trimmed
        } as any)
        .execute()
}