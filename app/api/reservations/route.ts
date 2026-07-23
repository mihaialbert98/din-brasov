/**
 * Public reservation booking — anonymous (no login). Name + phone mandatory,
 * email optional. Validates the slot against the restaurant's enabled hours,
 * rate-limits by phone, and (in auto mode) confirms immediately + emails the guest.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { restaurants, reservations, users, newsletterSubscribers } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { canReserve, validateBooking } from "@/lib/reservations";
import { sendReservationConfirmedEmail, sendNewsletterWelcomeEmail } from "@/lib/email";
import { checkReservationLimit, hashIp, getIp } from "@/lib/rate-limit";

const schema = z.object({
  restaurantId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  partySize: z.number().int().min(1).max(50),
  guestName: z.string().min(2).max(100),
  guestPhone: z.string().min(6).max(20),
  guestEmail: z.string().email().max(200).optional().or(z.literal("")),
  area: z.enum(["inside", "outside"]).optional(),
  note: z.string().max(500).optional(),
  // Logged-in extras: update the account phone; subscribe to Brașov restaurant promos.
  updatePhone: z.boolean().optional(),
  subscribePromo: z.boolean().optional(),
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
  // must still have enough free seats in the chosen area (re-checked to prevent oversell).
  const slot = await validateBooking(d.restaurantId, d.date, d.time, d.partySize, d.area);
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

  const userId = session?.user?.id ?? null;

  await db.insert(reservations).values({
    restaurantId: d.restaurantId,
    date: d.date,
    time: d.time,
    partySize: d.partySize,
    guestName: d.guestName,
    guestPhone: d.guestPhone,
    guestEmail: d.guestEmail || null,
    area: d.area ?? null,
    // Tables mode: the table(s) validateBooking assigned to this booking.
    assignedTableIds: slot.assignedTableIds ? JSON.stringify(slot.assignedTableIds) : null,
    userId,
    status,
    note: d.note || null,
  });

  // Guest email for a confirmation mail: the booking email, else the account email.
  let notifyEmail = d.guestEmail || null;

  // Logged-in extras: capture the account email + persist the phone to the account
  // (on first booking, or when they asked to update it).
  let accountEmail: string | null = null;
  if (userId) {
    const [u] = await db.select({ phone: users.phone, email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    if (u) {
      accountEmail = u.email;
      if (!notifyEmail) notifyEmail = u.email;
      if (!u.phone || d.updatePhone) {
        await db.update(users).set({ phone: d.guestPhone, updatedAt: new Date() }).where(eq(users.id, userId));
      }
    }
  }

  // Newsletter opt-in → evenimente + localuri. Single opt-in: the tick is the consent
  // (logged below), so the subscriber is ACTIVE immediately — no confirmation link. A
  // one-time welcome email (with unsubscribe) acknowledges it. Best-effort; never blocks the booking.
  if (d.subscribePromo) {
    const subEmail = (userId ? accountEmail : d.guestEmail || null)?.toLowerCase().trim() || null;
    if (subEmail) {
      try {
        const [existing] = await db
          .select({ id: newsletterSubscribers.id })
          .from(newsletterSubscribers)
          .where(sql`lower(${newsletterSubscribers.email}) = ${subEmail}`)
          .limit(1);
        if (!existing) {
          const token = crypto.randomUUID();
          await db.insert(newsletterSubscribers).values({
            email: subEmail,
            userId,
            wantsEvents: true,
            wantsPlaces: true,
            status: "active",
            verificationToken: token,
            verifiedAt: new Date(),
            consentGivenAt: new Date(),
            ipHash: hashIp(getIp(req)),
          });
          void sendNewsletterWelcomeEmail(subEmail, token).catch(() => {});
        }
      } catch {
        /* unique race or send failure → ignore; the booking already succeeded */
      }
    }
  }

  // Auto-confirm mode → email the guest their confirmation immediately (if we have
  // an email). In manual mode nothing is sent here — the email goes out when a staff
  // member confirms/declines the pending request. Best-effort; never blocks the booking.
  if (status === "confirmed" && notifyEmail) {
    void sendReservationConfirmedEmail(notifyEmail, {
      restaurantName: r.name,
      date: d.date,
      time: d.time,
      partySize: d.partySize,
      guestName: d.guestName,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, status });
}
