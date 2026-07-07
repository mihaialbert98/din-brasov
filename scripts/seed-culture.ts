/**
 * Standalone mock data for the "Cultură" area — future-dated cultural EVENTS.
 *
 * Why a separate script (not the main seed.ts):
 *  - The main seed's events are past-dated (2024–2025) and use the English
 *    category "Cultural" — neither would show under the Cultură filter (which
 *    matches the Romanian "Cultură" and hides finished events).
 *  - Lets you top up test data without wiping everything.
 *
 * These are dated ~1–5 weeks in the FUTURE from run time, category "Cultură"
 * (matching CULTURE_CATEGORY / the admin dropdown), status "published" — so they
 * appear on /evenimente, /evenimente?categorie=Cultură, and the homepage teaser,
 * and survive the 2-week-post-end retention job.
 *
 * Run:  pnpm tsx scripts/seed-culture.ts
 * Idempotent: removes previously seeded rows (slug prefix "seed-cultura-") first.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { like } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { CULTURE_CATEGORY } from "../lib/categories";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

/** Date `days` from now, at a given local hour:minute. */
function fromNow(days: number, hour = 19, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function seedCulture() {
  console.log("🎭 Seeding Cultură (cultural events) mock data...");

  // Idempotent: clear any previously seeded culture rows so re-runs don't pile up.
  const removed = await db
    .delete(schema.events)
    .where(like(schema.events.slug, "seed-cultura-%"))
    .returning({ id: schema.events.id });
  if (removed.length) console.log(`  cleaned ${removed.length} previously seeded culture events`);

  const rows: (typeof schema.events.$inferInsert)[] = [
    {
      title: "Vernisaj: „Culorile Brașovului” — pictură contemporană",
      description:
        "Expoziție de pictură a artiștilor brașoveni contemporani, reunind peste 40 de lucrări inspirate de peisajul urban și natural al orașului. Vernisajul este urmat de o discuție cu artiștii. Intrare liberă.",
      slug: "seed-cultura-vernisaj-culorile-brasovului",
      startsAt: fromNow(4, 18, 0),
      endsAt: fromNow(18, 20, 0),
      locationName: "Muzeul de Artă Brașov",
      address: "Bulevardul Eroilor 21, Brașov",
      latitude: "45.6497",
      longitude: "25.6065",
      category: CULTURE_CATEGORY,
      imageUrl: "https://images.unsplash.com/photo-1531913764164-f85c52e6e654?w=800&q=80",
      isFree: true,
      status: "published",
    },
    {
      title: "Spectacol de teatru: „O scrisoare pierdută” de I.L. Caragiale",
      description:
        "Trupa Teatrului „Sică Alexandrescu” pune în scenă capodopera lui Caragiale, într-o montare modernă și plină de umor. O seară de teatru clasic românesc, recomandată tuturor vârstelor.",
      slug: "seed-cultura-teatru-scrisoare-pierduta",
      startsAt: fromNow(7, 19, 30),
      endsAt: fromNow(7, 22, 0),
      locationName: "Teatrul „Sică Alexandrescu”",
      address: "Piața Teatrului 1, Brașov",
      latitude: "45.6533",
      longitude: "25.6100",
      category: CULTURE_CATEGORY,
      imageUrl: "https://images.unsplash.com/photo-1503095396549-807759245b35?w=800&q=80",
      isFree: false,
      price: "45",
      currency: "RON",
      status: "published",
    },
    {
      title: "Noaptea Muzeelor la Brașov",
      description:
        "Muzeele brașovene își deschid porțile până târziu în noapte, cu tururi ghidate gratuite, ateliere pentru copii și expoziții speciale. Un traseu cultural prin inima orașului medieval.",
      slug: "seed-cultura-noaptea-muzeelor",
      startsAt: fromNow(12, 17, 0),
      endsAt: fromNow(12, 23, 59),
      locationName: "Centrul istoric Brașov",
      address: "Piața Sfatului, Brașov",
      latitude: "45.6427",
      longitude: "25.5887",
      category: CULTURE_CATEGORY,
      imageUrl: "https://images.unsplash.com/photo-1566127992631-137a642a90f4?w=800&q=80",
      isFree: true,
      status: "published",
    },
    {
      title: "Recital de poezie și muzică: „Serile Eminescu”",
      description:
        "O seară dedicată poeziei românești, cu recitaluri susținute de actori invitați și acompaniament de pian. Atmosferă intimă, într-un spațiu cultural boem din centrul Brașovului.",
      slug: "seed-cultura-serile-eminescu",
      startsAt: fromNow(16, 19, 0),
      endsAt: fromNow(16, 21, 0),
      locationName: "Casa Mureșenilor",
      address: "Piața Sfatului 25, Brașov",
      latitude: "45.6425",
      longitude: "25.5885",
      category: CULTURE_CATEGORY,
      imageUrl: "https://images.unsplash.com/photo-1470549638415-0a0755be0619?w=800&q=80",
      isFree: false,
      price: "30",
      currency: "RON",
      status: "published",
    },
    {
      title: "Festivalul Filmului European — ediție de primăvară",
      description:
        "Proiecții de filme europene premiate, cu subtitrare în română, urmate de dezbateri cu critici de film. Program pe durata a cinci zile, în mai multe săli din oraș. Abonament sau bilet individual.",
      slug: "seed-cultura-festivalul-filmului-european",
      startsAt: fromNow(21, 18, 0),
      endsAt: fromNow(26, 22, 30),
      locationName: "Cinema One Brașov",
      address: "Str. Bazaltului 2, Brașov",
      latitude: "45.6550",
      longitude: "25.6280",
      category: CULTURE_CATEGORY,
      imageUrl: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&q=80",
      isFree: false,
      price: "25",
      currency: "RON",
      status: "published",
    },
  ];

  await db.insert(schema.events).values(rows);
  console.log(`  ✅ inserted ${rows.length} Cultură events (dated 4–26 days ahead).`);
  console.log("  View: /evenimente?categorie=Cultură  ·  and the homepage Cultură row.");
}

seedCulture()
  .then(() => {
    console.log("🎭 Done.");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
