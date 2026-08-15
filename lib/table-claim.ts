/**
 * Take a set of tables for a booking — atomically, or not at all.
 *
 * Shared by both table systems: „Plan de sală” (`floor_table_ids`, seats mode) and the
 * manual override in „Mese individuale” (`assigned_table_ids`). The rule and the hazard
 * are identical in both, so the statement lives in one place.
 *
 * WHY THIS EXISTS. The obvious shape — read the current holders, decide, then write — is
 * two round trips, and the neon-http driver runs every query as its own implicit
 * READ COMMITTED transaction. Two staff assigning the same table at the same moment both
 * read it as free and both write. Measured on the dev branch before this existed: 39 of 40
 * simultaneous attempts ended with two bookings holding one table, silently — the exact
 * outcome the tables exist to prevent.
 *
 * The fix has two halves, and BOTH are needed:
 *   1. one statement — the conflict check is a NOT EXISTS inside the UPDATE, so Postgres
 *      evaluates it as part of the write rather than trusting a value we read earlier;
 *   2. SERIALIZABLE — under READ COMMITTED each statement still sees a snapshot from
 *      before the other committed, so both would pass. SSI detects the read/write cycle
 *      between the two and aborts one.
 *
 * Returns false when the tables were taken in the meantime. Callers re-read to build a
 * precise message: to the person clicking, losing a race by half a second and finding the
 * table already taken are the same event.
 */
import { neonSql } from "@/lib/db";
import { toMinutes } from "@/lib/reservation-core";

/** Which table system is being claimed. */
export type TableColumn = "floor_table_ids" | "assigned_table_ids";

export async function claimTables(
  column: TableColumn,
  restaurantId: string,
  reservationId: string,
  dateStr: string,
  time: string,
  turnMinutes: number,
  /** The restaurant's standard turn, for rows predating `turn_minutes`. */
  standardTurn: number,
  ids: string[],
): Promise<boolean> {
  const sql = neonSql();
  const start = toMinutes(time);
  const end = start + turnMinutes;
  const wanted = JSON.stringify(ids);

  try {
    // The two statements differ only in the column read and written — and in the manual
    // flag, which only the capacity-mode override sets. Written out in full rather than
    // interpolated, so no identifier is ever built from a string.
    const stmt =
      column === "floor_table_ids"
        ? sql`
            UPDATE reservations
               SET floor_table_ids = ${wanted}, updated_at = now()
             WHERE id = ${reservationId}
               AND restaurant_id = ${restaurantId}
               AND status IN ('pending', 'confirmed')
               AND NOT EXISTS (
                 SELECT 1 FROM reservations o
                  WHERE o.restaurant_id = ${restaurantId}
                    AND o.date = ${dateStr}
                    AND o.id <> ${reservationId}
                    AND o.status IN ('pending', 'confirmed')
                    AND o.floor_table_ids IS NOT NULL
                    AND ${start} < (split_part(o.time, ':', 1)::int * 60 + split_part(o.time, ':', 2)::int) + coalesce(o.turn_minutes, ${standardTurn})
                    AND (split_part(o.time, ':', 1)::int * 60 + split_part(o.time, ':', 2)::int) < ${end}
                    AND EXISTS (
                      SELECT 1 FROM jsonb_array_elements_text(o.floor_table_ids::jsonb) AS held(id)
                        JOIN jsonb_array_elements_text(${wanted}::jsonb) AS want(id) ON held.id = want.id
                    )
               )
         RETURNING id`
        : sql`
            UPDATE reservations
               SET assigned_table_ids = ${wanted}, assigned_tables_manual = true, updated_at = now()
             WHERE id = ${reservationId}
               AND restaurant_id = ${restaurantId}
               AND status IN ('pending', 'confirmed')
               AND NOT EXISTS (
                 SELECT 1 FROM reservations o
                  WHERE o.restaurant_id = ${restaurantId}
                    AND o.date = ${dateStr}
                    AND o.id <> ${reservationId}
                    AND o.status IN ('pending', 'confirmed')
                    AND o.assigned_table_ids IS NOT NULL
                    AND ${start} < (split_part(o.time, ':', 1)::int * 60 + split_part(o.time, ':', 2)::int) + coalesce(o.turn_minutes, ${standardTurn})
                    AND (split_part(o.time, ':', 1)::int * 60 + split_part(o.time, ':', 2)::int) < ${end}
                    AND EXISTS (
                      SELECT 1 FROM jsonb_array_elements_text(o.assigned_table_ids::jsonb) AS held(id)
                        JOIN jsonb_array_elements_text(${wanted}::jsonb) AS want(id) ON held.id = want.id
                    )
               )
         RETURNING id`;

    const [rows] = await sql.transaction([stmt], { isolationLevel: "Serializable" });
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    // 40001 serialization_failure / 40P01 deadlock → the other writer won.
    const code = (e as { code?: string })?.code;
    if (code === "40001" || code === "40P01") return false;
    throw e;
  }
}
