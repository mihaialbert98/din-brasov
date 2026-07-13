/**
 * Public reservation booking — anonymous (no login). Name + phone mandatory,
 * email optional. Validates the slot against the restaurant's enabled hours,
 * rate-limits by phone, and (in auto mode) confirms immediately + emails the guest.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { restaurants, reservations } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { canReserve, validateBooking } from "@/lib/reservations";
import { checkReservationLimit } from "@/lib/rate-limit";

const schema = z.object({
  restaurantId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  partySize: z.number().int().min(1).max(50),
  guestName: z.string().min(2).max(100),
  guestPhone: z.string().min(6).max(20),
  guestEmail: z.string().email().max(200).optional().or(z.literal("")),
  note: z.string().max(500).optional(),
  // Anti-bot: honeypot must stay empty; elapsed must be ≥ 2s.
  website: z.string().optional(),
  elapsed: z.number().optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  const d = parsed.data;

  // Honeypot + timing check (bots fill hidden fields / submit instantly).
  if (d.website || (typeof d.elapsed === "number" && d.elapsed < 2000)) {
    return NextResponse.json({ ok: true }); // silently drop
  }

  // Booking must be for today or later.
  const today = new Date().toISOString().slice(0, 10);
  if (d.date < today) return NextResponse.json({ error: "Data trebuie să fie în viitor." }, { status: 400 });

  // The restaurant must actually be taking reservations.
  if (!(await canReserve(d.restaurantId))) {
    return NextResponse.json({ error: "Acest restaurant nu acceptă rezervări momentan." }, { status: 400 });
  }

  // Slot must fall within an enabled window, party within the cap, and the slot
  // must still have enough free seats (re-checked here to prevent oversell).
  const slot = await validateBooking(d.restaurantId, d.date, d.time, d.partySize);
  if (!slot.ok) return NextResponse.json({ error: slot.reason }, { status: 400 });

  // Rate limit by phone (anti-spam).
  if (!(await checkReservationLimit(d.guestPhone))) {
    return NextResponse.json({ error: "Prea multe rezervări. Încearcă din nou mai târziu." }, { status: 429 });
  }

  const [r] = await db
    .select({ name: restaurants.name, confirmMode: restaurants.reservationConfirmMode })
    .from(restaurants)
    .where(eq(restaurants.id, d.restaurantId))
    .limit(1);
  if (!r) return NextResponse.json({ error: "Restaurant negăsit." }, { status: 404 });

  const session = await auth().catch(() => null);
  const status = r.confirmMode === "auto" ? "confirmed" : "pending";

  await db.insert(reservations).values({
    restaurantId: d.restaurantId,
    date: d.date,
    time: d.time,
    partySize: d.partySize,
    guestName: d.guestName,
    guestPhone: d.guestPhone,
    guestEmail: d.guestEmail || null,
    userId: session?.user?.id ?? null,
    status,
    note: d.note || null,
  });

  // No guest email is sent — the restaurant handles confirmation by phone. The
  // client sees an on-screen result + a gentle signup invite instead.
  return NextResponse.json({ ok: true, status });
}
