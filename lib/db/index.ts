import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function makeDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql, { schema });
}

type Db = ReturnType<typeof makeDb>;

let _db: Db | undefined;
let _sql: ReturnType<typeof neon> | undefined;

/**
 * The raw Neon client, for the rare statement that needs a real transaction.
 *
 * The neon-http driver Drizzle uses has NO interactive transactions — every query is its
 * own implicit READ COMMITTED transaction — so a read-then-write check can be overtaken
 * by a concurrent writer. `sql.transaction([...], { isolationLevel: "Serializable" })`
 * runs a batch under SSI, which makes Postgres itself reject the loser of such a race.
 * Only reach for this where two users really can collide on the same row set; ordinary
 * queries should keep using `db`.
 */
export function neonSql(): ReturnType<typeof neon> {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!);
  return _sql;
}

export const db = new Proxy({} as Db, {
  get(_, prop) {
    if (!_db) _db = makeDb();
    return (_db as any)[prop];
  },
});
