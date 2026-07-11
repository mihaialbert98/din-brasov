/**
 * Dev seed: mock DISABLED listings so the profile "Anunțuri dezactivate" section
 * and the admin "Dezactivate" tab can be eyeballed. Idempotent via slug prefix.
 *
 * Run: pnpm tsx scripts/seed-disabled.ts   (dev DB from .env.local only)
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

const DAY = 24 * 60 * 60 * 1000;
const PREFIX = "seed-disabled-";

// Owners (dev users confirmed present)
const ION = "cf6b0775-5b5a-489e-8012-27335434326f"; // Ion Popescu (user, allowance 2)
const MARIA = "01336e42-03a5-4445-9011-a6ac6460bdf1"; // Maria Ionescu (user, allowance 2)

type Row = {
  slug: string;
  title: string;
  description: string;
  price: string;
  category: string;
  sellerId: string | null;
  contactPhone: string | null;
  disabledDaysAgo: number;
};

const rows: Row[] = [
  {
    slug: `${PREFIX}canapea`,
    title: "Canapea extensibilă, stare bună",
    description: "Canapea extensibilă cu ladă de depozitare. Dezactivată de proprietar — test.",
    price: "650",
    category: "Mobilă",
    sellerId: ION,
    contactPhone: "0740111222",
    disabledDaysAgo: 2, // owner-disabled recently → ~28 zile rămase
  },
  {
    slug: `${PREFIX}bicicleta`,
    title: "Bicicletă MTB 26'', 21 viteze",
    description: "Bicicletă de munte, folosită puțin. Expirată automat la 30 de zile — test.",
    price: "480",
    category: "Sport",
    sellerId: MARIA,
    contactPhone: "0740333444",
    disabledDaysAgo: 25, // aged out, near auto-delete → ~5 zile rămase
  },
  {
    slug: `${PREFIX}orphan-frigider`,
    title: "Frigider Arctic, 2 uși",
    description: "Anunț rămas fără proprietar (cont șters) — apare doar în admin, netreactivabil.",
    price: "300",
    category: "Electrocasnice",
    sellerId: null, // account-deletion orphan
    contactPhone: null,
    disabledDaysAgo: 10,
  },
];

async function main() {
  const now = Date.now();
  for (const r of rows) {
    const disabledAt = new Date(now - r.disabledDaysAgo * DAY);
    // expires_at is in the past for the aged-out case; arbitrary for the others.
    const expiresAt = new Date(now - r.disabledDaysAgo * DAY);

    const id = crypto.randomUUID();
    await sql`
      insert into listings
        (id, title, description, slug, price, currency, category, condition,
         location, city, seller_id, contact_phone, status, expires_at,
         disabled_at, is_assisted, created_at, updated_at)
      values
        (${id}, ${r.title}, ${r.description}, ${r.slug}, ${r.price}, 'RON', ${r.category}, 'used',
         'Brașov', 'Brașov', ${r.sellerId}, ${r.contactPhone}, 'disabled', ${expiresAt},
         ${disabledAt}, false, ${new Date(now - 40 * DAY)}, ${disabledAt})
      on conflict (slug) do update set
        status = 'disabled',
        seller_id = ${r.sellerId},
        contact_phone = ${r.contactPhone},
        disabled_at = ${disabledAt},
        expires_at = ${expiresAt},
        updated_at = ${disabledAt}
    `;
    console.log(`✓ ${r.slug}  (seller: ${r.sellerId ?? "NULL/orphan"}, disabled ${r.disabledDaysAgo}d ago)`);
  }

  const check = await sql`
    select slug, status, seller_id, disabled_at
    from listings where slug like ${PREFIX + "%"} order by slug
  `;
  console.log("\nSeeded disabled listings:");
  console.table(check);
}

main().catch((e) => {
  console.error("SEED ERROR:", e.message);
  process.exit(1);
});
