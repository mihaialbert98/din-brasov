import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

const PASS = "TestParola123";
const EXPIRES = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

async function upsertUser(email: string, name: string) {
  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (existing) {
    console.log(`  ↳ user already exists: ${email} (id: ${existing.id})`);
    return existing.id;
  }
  const hash = await bcrypt.hash(PASS, 10);
  const [created] = await db
    .insert(schema.users)
    .values({ name, email, password: hash, role: "user", gdprConsentAt: new Date() })
    .returning({ id: schema.users.id });
  console.log(`  ✓ created user: ${email} (id: ${created.id})`);
  return created.id;
}

async function main() {
  console.log("🌱 Seeding test accounts...\n");

  // ── User A: Ion Popescu — seller with 3 listings ──────────────────────────
  console.log("User A: ion.popescu@test.dinbrasov.ro");
  const ionId = await upsertUser("ion.popescu@test.dinbrasov.ro", "Ion Popescu");

  await db
    .insert(schema.listings)
    .values([
      {
        title: "Bicicletă de munte Trek — stare excelentă",
        description: "Bicicletă Trek Marlin 7, 29 inch, 21 viteze, achiziționată în 2022. Folosită sezonier, frâne hidraulice, cauciucuri noi. Ideal pentru trasee montane sau plimbări în parc. Se poate testa în Brașov.",
        slug: "bicicleta-de-munte-trek-stare-excelenta-2026-06-10",
        price: "1800",
        currency: "RON",
        category: "Sport",
        condition: "used",
        location: "Brașov, Schei",
        sellerId: ionId,
        contactPhone: "0722111222",
        contactEmail: "ion.popescu@test.dinbrasov.ro",
        status: "active",
        expiresAt: EXPIRES,
      },
      {
        title: "Laptop Dell XPS 15 — 16GB RAM, i7",
        description: "Dell XPS 15 9520, procesor Intel i7-12700H, 16GB RAM DDR5, SSD 512GB NVMe, ecran 4K OLED 15.6\". Accesorii originale incluse. Garanție până în august 2026. Factură disponibilă.",
        slug: "laptop-dell-xps-15-16gb-ram-i7-2026-06-10",
        price: "5500",
        currency: "RON",
        category: "Electronice",
        condition: "used",
        location: "Brașov, Centru",
        sellerId: ionId,
        contactPhone: "0722111222",
        contactEmail: "ion.popescu@test.dinbrasov.ro",
        status: "active",
        expiresAt: EXPIRES,
      },
      {
        title: "Canapea extensibilă 3 locuri — maro, ca nouă",
        description: "Canapea extensibilă în stare impecabilă, culoare maro/bej, tapițerie din catifea, mecanism de extensie ușor. Dimensiuni desfășurate: 200x140 cm. Se vinde din cauza mutării. Transport negociabil.",
        slug: "canapea-extensibila-3-locuri-maro-ca-noua-2026-06-10",
        price: "950",
        currency: "RON",
        category: "Mobilă",
        condition: "used",
        location: "Brașov, Bartolomeu",
        sellerId: ionId,
        contactPhone: "0722111222",
        contactEmail: "ion.popescu@test.dinbrasov.ro",
        status: "active",
        expiresAt: EXPIRES,
      },
    ])
    .onConflictDoNothing();

  console.log("  ✓ 3 listings created for Ion Popescu\n");

  // ── User B: Maria Ionescu — seller with 2 listings ────────────────────────
  console.log("User B: maria.ionescu@test.dinbrasov.ro");
  const mariaId = await upsertUser("maria.ionescu@test.dinbrasov.ro", "Maria Ionescu");

  await db
    .insert(schema.listings)
    .values([
      {
        title: "Rochie de mireasă – mărimea 38, ivory",
        description: "Rochie de mireasă corset cu dantelă, tren de 1.5m, petticoat inclus, mărimea 38 (poate fi modificată la 36-40). Purtată o singură dată. Spălată și depozitată profesional. Accesorii disponibile separat.",
        slug: "rochie-de-mireasa-marimea-38-ivory-2026-06-10",
        price: "1200",
        currency: "RON",
        category: "Haine",
        condition: "used",
        location: "Brașov, Tractorul",
        sellerId: mariaId,
        contactPhone: "0733444555",
        contactEmail: "maria.ionescu@test.dinbrasov.ro",
        status: "active",
        expiresAt: EXPIRES,
      },
      {
        title: "Curs de yoga – 8 ședințe în Brașov",
        description: "Ofer curs de yoga pentru începători și intermediari, grup mic (max 6 persoane). 8 ședințe săptămânale de câte 60 min. Locație: Brașov, zona Centru. Pret per persoana, taxa inscrierii inclusa.",
        slug: "curs-de-yoga-8-sedinte-in-brasov-2026-06-10",
        price: "350",
        currency: "RON",
        category: "Servicii",
        condition: "not_applicable",
        location: "Brașov, Centru",
        sellerId: mariaId,
        contactPhone: "0733444555",
        contactEmail: "maria.ionescu@test.dinbrasov.ro",
        status: "active",
        expiresAt: EXPIRES,
      },
    ])
    .onConflictDoNothing();

  console.log("  ✓ 2 listings created for Maria Ionescu\n");

  console.log("─────────────────────────────────────────────");
  console.log("Test accounts ready:");
  console.log("");
  console.log("  User A — Ion Popescu (3 anunțuri)");
  console.log("  Email:    ion.popescu@test.dinbrasov.ro");
  console.log("  Parolă:   TestParola123");
  console.log("");
  console.log("  User B — Maria Ionescu (2 anunțuri)");
  console.log("  Email:    maria.ionescu@test.dinbrasov.ro");
  console.log("  Parolă:   TestParola123");
  console.log("");
  console.log("  Testare mesagerie: logat ca Maria, intră pe un anunț al lui Ion");
  console.log("  și apasă 'Contactează vânzătorul'.");
  console.log("─────────────────────────────────────────────");
}

main().catch(console.error);
