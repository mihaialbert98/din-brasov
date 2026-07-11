/**
 * End-to-end test of the disabled-listing lifecycle against the DEV DB.
 * Exercises the REAL functions used by the cron + account deletion, and the same
 * DB writes the owner disable/reactivate routes perform. Cleans up after itself.
 *
 * Run: pnpm tsx scripts/test-disabled-lifecycle.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../lib/db";
import { listings, users } from "../lib/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { hardDeleteDisabledListings, anonymiseUserListings, RETENTION } from "../lib/gdpr";

const DAY = 24 * 60 * 60 * 1000;
const TEST_PREFIX = "lifecycle-test-";
const ION = "cf6b0775-5b5a-489e-8012-27335434326f";

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function makeListing(slug: string, patch: Partial<typeof listings.$inferInsert> = {}) {
  const id = crypto.randomUUID();
  await db.insert(listings).values({
    id,
    title: `Test ${slug}`,
    description: "Lifecycle test listing.",
    slug,
    category: "Altele",
    city: "Brașov",
    sellerId: ION,
    status: "active",
    expiresAt: new Date(Date.now() + 30 * DAY),
    ...patch,
  });
  return id;
}

async function getStatus(id: string) {
  const [r] = await db
    .select({ status: listings.status, disabledAt: listings.disabledAt, expiresAt: listings.expiresAt, sellerId: listings.sellerId })
    .from(listings).where(eq(listings.id, id)).limit(1);
  return r;
}

async function cleanup() {
  const rows = await db.select({ id: listings.id }).from(listings);
  // delete only our test slugs
  const test = await db.select({ id: listings.id, slug: listings.slug }).from(listings);
  for (const t of test) {
    if (t.slug.startsWith(TEST_PREFIX)) await db.delete(listings).where(eq(listings.id, t.id));
  }
}

async function main() {
  await cleanup();
  console.log("\n=== 1. Owner DISABLE (active → disabled + disabledAt) ===");
  {
    const id = await makeListing(`${TEST_PREFIX}disable`);
    // mirror /api/listings/[id]/disable
    const now = new Date();
    await db.update(listings).set({ status: "disabled", disabledAt: now, updatedAt: now })
      .where(and(eq(listings.id, id), eq(listings.status, "active")));
    const s = await getStatus(id);
    assert("status becomes disabled", s.status === "disabled", s.status);
    assert("disabledAt is set", !!s.disabledAt);
  }

  console.log("\n=== 2. Owner REACTIVATE (disabled → active, fresh 30d, disabledAt cleared) ===");
  {
    const id = await makeListing(`${TEST_PREFIX}react`, { status: "disabled", disabledAt: new Date(Date.now() - 5 * DAY) });
    // mirror /api/listings/[id]/reactivate
    const now = new Date();
    const newExpires = new Date(now.getTime() + 30 * DAY);
    await db.update(listings).set({ status: "active", expiresAt: newExpires, disabledAt: null, updatedAt: now })
      .where(eq(listings.id, id));
    const s = await getStatus(id);
    assert("status becomes active", s.status === "active", s.status);
    assert("disabledAt cleared", s.disabledAt === null);
    assert("expiresAt ~30 days out", !!s.expiresAt && s.expiresAt.getTime() > Date.now() + 29 * DAY);
  }

  console.log("\n=== 3. Auto-disable at expiry (cron step 1: active + past expiry → disabled) ===");
  {
    const id = await makeListing(`${TEST_PREFIX}expire`, { expiresAt: new Date(Date.now() - 1 * DAY) });
    // mirror cron step 1
    const now = new Date();
    await db.update(listings).set({ status: "disabled", disabledAt: now, updatedAt: now })
      .where(and(eq(listings.status, "active"), lt(listings.expiresAt, now)));
    const s = await getStatus(id);
    assert("expired-active listing becomes disabled", s.status === "disabled", s.status);
    assert("disabledAt stamped", !!s.disabledAt);
  }

  console.log("\n=== 4. Hard-delete after 30 days disabled (REAL hardDeleteDisabledListings) ===");
  {
    const oldId = await makeListing(`${TEST_PREFIX}old`, { status: "disabled", disabledAt: new Date(Date.now() - (RETENTION.LISTING_DISABLED_DAYS + 1) * DAY) });
    const freshId = await makeListing(`${TEST_PREFIX}fresh`, { status: "disabled", disabledAt: new Date(Date.now() - 2 * DAY) });
    const deleted = await hardDeleteDisabledListings();
    const oldGone = !(await getStatus(oldId));
    const freshStays = !!(await getStatus(freshId));
    assert("31-day-old disabled listing hard-deleted", oldGone);
    assert("2-day-old disabled listing kept", freshStays);
    assert("delete count >= 1", deleted >= 1, `count=${deleted}`);
  }

  console.log("\n=== 5. Account deletion → disabled + seller null (REAL anonymiseUserListings) ===");
  {
    // create a throwaway user + one active listing
    const uid = crypto.randomUUID();
    await db.insert(users).values({ id: uid, email: `${TEST_PREFIX}${uid}@test.local`, name: "Throwaway", role: "user" });
    const id = await makeListing(`${TEST_PREFIX}acct`, { sellerId: uid, status: "active" });
    await anonymiseUserListings(uid);
    const s = await getStatus(id);
    assert("listing becomes disabled", s.status === "disabled", s.status);
    assert("sellerId nulled (orphan)", s.sellerId === null);
    assert("disabledAt set (starts 30d delete clock)", !!s.disabledAt);
    // cleanup user + listing
    await db.delete(listings).where(eq(listings.id, id));
    await db.delete(users).where(eq(users.id, uid));
  }

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
