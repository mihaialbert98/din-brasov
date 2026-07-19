/**
 * Seed a realistic set of demo localuri across every food/drink category, with
 * images, Brașov addresses, descriptions, phone + website — so the /localuri page
 * and its category filter look real. DEV DB only. Idempotent (marker slug prefix
 * "demo-"; re-running replaces them).
 *
 * Run: pnpm tsx scripts/seed-demo-localuri.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { db } from "../lib/db";
import { places } from "../lib/db/schema";
import { like } from "drizzle-orm";
import { slugifyWithDate } from "../lib/slugify";

const IMG = {
  restaurant: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&h=800&fit=crop",
  cafenea: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200&h=800&fit=crop",
  bar: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=1200&h=800&fit=crop",
  pub: "https://images.unsplash.com/photo-1436076863939-06870fe779c2?w=1200&h=800&fit=crop",
  cofetarie: "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=1200&h=800&fit=crop",
  fastfood: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1200&h=800&fit=crop",
};

const DEMO = [
  { name: "Trattoria del Corso", category: "Restaurant", img: IMG.restaurant,
    desc: "Bucătărie italiană autentică în centrul istoric — paste făcute în casă, pizza la cuptor cu lemne și vinuri de autor.",
    address: "Strada Republicii 45, Brașov", phone: "0368 401 201", website: "https://example.com/trattoria" },
  { name: "Cafeneaua de pe Deal", category: "Cafenea", img: IMG.cafenea,
    desc: "Cafea de specialitate, prăjituri artizanale și o priveliște superbă spre Tâmpa. Loc perfect de dimineață.",
    address: "Strada Castelului 12, Brașov", phone: "0722 100 200" },
  { name: "Speakeasy 55", category: "Bar", img: IMG.bar,
    desc: "Cocktail bar cu atmosferă intimă și un bartender cu mână bună. Signature drinks și muzică live în weekend.",
    address: "Strada Michael Weiss 8, Brașov", phone: "0733 555 555", website: "https://example.com/speakeasy" },
  { name: "Berăria Sașilor", category: "Pub", img: IMG.pub,
    desc: "Bere artizanală locală, platouri de sharing și ecrane pentru meciuri. Terasă mare în sezon.",
    address: "Strada Mureșenilor 22, Brașov", phone: "0368 402 300" },
  { name: "Dulcinella", category: "Cofetărie", img: IMG.cofetarie,
    desc: "Torturi la comandă, éclairs, macarons și înghețată de casă. Ingrediente naturale, fără conservanți.",
    address: "Bulevardul Eroilor 5, Brașov", phone: "0745 321 654" },
  { name: "Burger Station", category: "Fast-food", img: IMG.fastfood,
    desc: "Burgeri smash, cartofi crocanți și shake-uri groase. Comandă rapidă, ingrediente proaspete zilnic.",
    address: "Strada Lungă 130, Brașov", phone: "0755 987 123" },
  { name: "Bistro Piața Unirii", category: "Restaurant", img: IMG.restaurant,
    desc: "Meniu de sezon cu ingrediente de la producători locali. Preparate mediteraneene cu accente românești.",
    address: "Piața Unirii 3, Brașov", phone: "0368 403 404" },
  { name: "Coffee & Books", category: "Cafenea", img: IMG.cafenea,
    desc: "Cafenea-librărie unde poți lucra, citi sau lua o pauză. WiFi rapid, prize la fiecare masă.",
    address: "Strada Gheorghe Barițiu 10, Brașov" },
];

async function main() {
  await db.delete(places).where(like(places.slug, "demo-%"));

  for (const d of DEMO) {
    await db.insert(places).values({
      name: d.name,
      description: d.desc,
      slug: "demo-" + slugifyWithDate(d.name),
      category: d.category,
      address: d.address,
      phone: d.phone ?? null,
      website: d.website ?? null,
      imagesJson: JSON.stringify([d.img]),
      status: "published",
    });
    console.log(`  ✓ [${d.category}] ${d.name}`);
  }

  console.log(`\n✓ Seeded ${DEMO.length} demo localuri. View: /localuri`);
  console.log("  Try the category filter (Toate / Restaurant / Bar / Pub / Cafenea / Cofetărie / Fast-food).");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
