/**
 * Owner: mark date ranges as closed for ONLINE reservations (holiday, private
 * event, vacation). A closure hides those dates from the public booking form;
 * staff can still add a booking on them after confirming. Reservations that
 * already exist on a closed date are never touched — POST reports them so the
 * owner can phone those guests.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, gte, lte, asc, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { reservationClosures, reservations } from "@/lib/db/schema";
import { authorizeReservationSettings } from "@/lib/restaurant-permissions";
import { auditAdminReservationChange } from "@/lib/reservations";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const addSchema = z.object({
  dateFrom: z.string().regex(ISO_DATE),
  // Omitted for a single closed day.
  dateTo: z.string().regex(ISO_DATE).optional(),
  reason: z.string().max(200).optional(),
  // Set after the owner has seen the affected-bookings warning.
  force: z.boolean().optional(),
});

async function gate(id: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  const g = await authorizeReservationSettings(session, role, id);
  return { session, role, g };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const data = await db
    .select()
    .from(reservationClosures)
    .where(eq(reservationClosures.restaurantId, id))
    .orderBy(asc(reservationClosures.dateFrom));
  return NextResponse.json({ data });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, role, g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const parsed = addSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  const { dateFrom, reason, force } = parsed.data;
  const dateTo = parsed.data.dateTo || dateFrom;
  if (dateTo < dateFrom) {
    return NextResponse.json({ error: "Data de sfârșit trebuie să fie după cea de început." }, { status: 400 });
  }

  // Closing a range that already holds bookings doesn't cancel them — but the owner
  // must know they exist, so they can call those guests. Same guard→confirm→report
  // flow as deleting a table.
  if (!force) {
    const affected = await db
      .select({
        id: reservations.id,
        date: reservations.date,
        time: reservations.time,
        partySize: reservations.partySize,
        guestName: reservations.guestName,
        guestPhone: reservations.guestPhone,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, id),
          gte(reservations.date, dateFrom),
          lte(reservations.date, dateTo),
          inArray(reservations.status, ["pending", "confirmed"]),
        ),
      )
      .orderBy(asc(reservations.date), asc(reservations.time));

    if (affected.length > 0) {
      return NextResponse.json(
        {
          error: `Există ${affected.length} ${affected.length === 1 ? "rezervare" : "rezervări"} în această perioadă.`,
          needsConfirm: true,
          affected,
        },
        { status: 409 },
      );
    }
  }

  await db.insert(reservationClosures).values({
    restaurantId: id,
    dateFrom,
    dateTo,
    reason: reason?.trim() || null,
  });
  await auditAdminReservationChange(session, role, id, "a marcat zile fără rezervări online");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, role, g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const closureId = new URL(req.url).searchParams.get("closureId");
  if (!closureId) return NextResponse.json({ error: "Lipsește closureId." }, { status: 400 });

  await db
    .delete(reservationClosures)
    .where(and(eq(reservationClosures.id, closureId), eq(reservationClosures.restaurantId, id)));
  await auditAdminReservationChange(session, role, id, "a redeschis zile pentru rezervări online");
  return NextResponse.json({ ok: true });
}
