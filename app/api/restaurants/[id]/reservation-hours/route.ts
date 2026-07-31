/** Owner: add or remove bookable-hours windows for reservations. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { reservationHours } from "@/lib/db/schema";
import { authorizeReservationSettings } from "@/lib/restaurant-permissions";
import { auditAdminReservationChange, bookingsInHoursWindow } from "@/lib/reservations";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const addSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(HHMM),
  endTime: z.string().regex(HHMM),
  slotMinutes: z.number().int().min(10).max(240).default(15),
  seatsPerSlot: z.number().int().min(1).max(200).default(20),
  // Per-area capacities — sent when the restaurant splits interior/terasă.
  seatsInside: z.number().int().min(0).max(200).optional(),
  seatsOutside: z.number().int().min(0).max(200).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  const gate = await authorizeReservationSettings(session, role, id);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const parsed = addSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  const { dayOfWeek, startTime, endTime } = parsed.data;
  if (startTime >= endTime) {
    return NextResponse.json({ error: "Ora de început trebuie să fie înainte de ora de sfârșit." }, { status: 400 });
  }

  // Reject overlap with an existing window on the same day (split shifts are fine
  // as long as they don't overlap — e.g. lunch 12–15 and dinner 18–23).
  const sameDay = await db
    .select({ startTime: reservationHours.startTime, endTime: reservationHours.endTime })
    .from(reservationHours)
    .where(and(eq(reservationHours.restaurantId, id), eq(reservationHours.dayOfWeek, dayOfWeek)));
  const overlaps = sameDay.some((w) => startTime < w.endTime && endTime > w.startTime);
  if (overlaps) {
    return NextResponse.json(
      { error: "Acest interval se suprapune cu unul existent în aceeași zi." },
      { status: 409 }
    );
  }

  await db.insert(reservationHours).values({ restaurantId: id, ...parsed.data });
  await auditAdminReservationChange(session, role, id, "a adăugat un interval de program");
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  hourId: z.string().min(1),
  // Edit the window/capacity (all optional) …
  startTime: z.string().regex(HHMM).optional(),
  endTime: z.string().regex(HHMM).optional(),
  slotMinutes: z.number().int().min(10).max(240).optional(),
  seatsPerSlot: z.number().int().min(1).max(200).optional(),
  seatsInside: z.number().int().min(0).max(200).nullable().optional(),
  seatsOutside: z.number().int().min(0).max(200).nullable().optional(),
  // … and/or pause/resume it.
  enabled: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  const gate = await authorizeReservationSettings(session, role, id);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  const { hourId, ...changes } = parsed.data;
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Nicio modificare." }, { status: 400 });
  }

  // The interval must belong to this restaurant.
  const [row] = await db
    .select({ dayOfWeek: reservationHours.dayOfWeek, startTime: reservationHours.startTime, endTime: reservationHours.endTime })
    .from(reservationHours)
    .where(and(eq(reservationHours.id, hourId), eq(reservationHours.restaurantId, id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Interval negăsit." }, { status: 404 });

  // Resolve the effective window after the edit (fall back to the stored values).
  const startTime = changes.startTime ?? row.startTime;
  const endTime = changes.endTime ?? row.endTime;
  if (startTime >= endTime) {
    return NextResponse.json({ error: "Ora de început trebuie să fie înainte de ora de sfârșit." }, { status: 400 });
  }

  // Overlap check against OTHER windows on the same day (exclude this one).
  const sameDay = await db
    .select({ id: reservationHours.id, startTime: reservationHours.startTime, endTime: reservationHours.endTime })
    .from(reservationHours)
    .where(and(eq(reservationHours.restaurantId, id), eq(reservationHours.dayOfWeek, row.dayOfWeek)));
  const overlaps = sameDay.some((w) => w.id !== hourId && startTime < w.endTime && endTime > w.startTime);
  if (overlaps) {
    return NextResponse.json({ error: "Acest interval se suprapune cu unul existent în aceeași zi." }, { status: 409 });
  }

  await db.update(reservationHours).set(changes).where(and(eq(reservationHours.id, hourId), eq(reservationHours.restaurantId, id)));
  const label = changes.enabled === false ? "a dezactivat un interval de program"
    : changes.enabled === true ? "a reactivat un interval de program"
    : "a modificat un interval de program";
  await auditAdminReservationChange(session, role, id, label);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  const gate = await authorizeReservationSettings(session, role, id);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const url = new URL(req.url);
  const hourId = url.searchParams.get("hourId");
  if (!hourId) return NextResponse.json({ error: "Lipsește hourId." }, { status: 400 });
  const force = url.searchParams.get("force") === "true";

  // Deleting an interval doesn't cancel the bookings inside it — but „șterge” sits
  // right next to „pauză” and only pausing is reversible, so show what's in there
  // first. The UI offers „Oprește temporar” as the safer alternative.
  if (!force) {
    const affected = await bookingsInHoursWindow(id, hourId);
    if (affected === null) return NextResponse.json({ error: "Interval negăsit." }, { status: 404 });
    if (affected.length > 0) {
      return NextResponse.json(
        {
          error: `${affected.length} ${affected.length === 1 ? "rezervare viitoare este" : "rezervări viitoare sunt"} în acest interval.`,
          needsConfirm: true,
          bookings: affected.slice(0, 10),
          affected: affected.length,
        },
        { status: 409 },
      );
    }
  }

  await db
    .delete(reservationHours)
    .where(and(eq(reservationHours.id, hourId), eq(reservationHours.restaurantId, id)));
  await auditAdminReservationChange(session, role, id, "a șters un interval de program");
  return NextResponse.json({ ok: true });
}
