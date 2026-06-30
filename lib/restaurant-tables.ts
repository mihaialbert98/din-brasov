/**
 * Table provisioning helper. Tables are auto-labeled "Masa 1", "Masa 2", … so the
 * owner just picks a count instead of typing each name. Adding more later continues
 * the sequence from the highest existing "Masa <n>" number (gaps from deletes are
 * not reused — keeps labels stable/unique). Each table gets its own QR token.
 */
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** Highest N among existing "Masa N" labels for a restaurant (0 if none). */
export async function highestTableNumber(restaurantId: string): Promise<number> {
  const rows = await db
    .select({ label: restaurantTables.label })
    .from(restaurantTables)
    .where(eq(restaurantTables.restaurantId, restaurantId));

  let max = 0;
  for (const r of rows) {
    const m = /^Masa\s+(\d+)$/i.exec(r.label.trim());
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}

/**
 * Create `count` tables labeled "Masa <next> … Masa <next+count-1>". Returns the
 * number created. No-op for count <= 0.
 */
export async function addNumberedTables(restaurantId: string, count: number): Promise<number> {
  const n = Math.floor(count);
  if (n <= 0) return 0;
  const start = (await highestTableNumber(restaurantId)) + 1;
  const values = Array.from({ length: n }, (_, i) => ({
    restaurantId,
    label: `Masa ${start + i}`,
  }));
  await db.insert(restaurantTables).values(values);
  return n;
}
