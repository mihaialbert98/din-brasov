import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function makeDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql, { schema });
}

type Db = ReturnType<typeof makeDb>;

let _db: Db | undefined;

export const db = new Proxy({} as Db, {
  get(_, prop) {
    if (!_db) _db = makeDb();
    return (_db as any)[prop];
  },
});
