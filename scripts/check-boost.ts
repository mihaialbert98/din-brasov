import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  const trek = await sql`SELECT id, title, is_boosted, boosted_until, status FROM listings WHERE title ILIKE '%trek%' OR title ILIKE '%biciclet%'`;
  console.log("Trek/bike listings:", JSON.stringify(trek, null, 2));

  const pay = await sql`SELECT netopia_order_id, type, status, boost_days, confirmed_at, created_at FROM payments ORDER BY created_at DESC LIMIT 5`;
  console.log("Recent payments:", JSON.stringify(pay, null, 2));
}

main().catch(console.error);
