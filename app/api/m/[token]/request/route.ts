/**
 * Anonymous diner → table service request (call waiter / ask for check).
 * No auth: the caller proves they're at the table by holding the unguessable
 * qrToken. Rate-limited per table; a second tap of the same type while one is
 * still pending just refreshes the existing request (no stacking).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { restaurantTables, restaurants, serviceRequests } from "@/lib/db/schema";
import { checkServiceRequestLimit } from "@/lib/rate-limit";

const schema = z
  .object({
    type: z.enum(["call_waiter", "request_check"]),
    paymentMethod: z.enum(["cash", "card"]).optional(),
  })
  // The check request must specify how the diner wants to pay.
  .refine((d) => d.type !== "request_check" || !!d.paymentMethod, {
    message: "Alege modalitatea de plată.",
  });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Cerere invalidă." }, { status: 400 });
  }

  // Resolve table → restaurant from the token; restaurant must be active AND the
  // table itself must not be disabled.
  const [ctx] = await db
    .select({
      tableId: restaurantTables.id,
      tableActive: restaurantTables.isActive,
      restaurantId: restaurants.id,
      status: restaurants.status,
    })
    .from(restaurantTables)
    .innerJoin(restaurants, eq(restaurantTables.restaurantId, restaurants.id))
    .where(eq(restaurantTables.qrToken, token))
    .limit(1);

  if (!ctx || ctx.status !== "active") {
    return NextResponse.json({ error: "Masă indisponibilă." }, { status: 404 });
  }
  if (!ctx.tableActive) {
    return NextResponse.json({ error: "Masa este momentan indisponibilă." }, { status: 409 });
  }

  if (!(await checkServiceRequestLimit(ctx.tableId))) {
    return NextResponse.json(
      { error: "Ai trimis prea multe cereri. Așteaptă puțin." },
      { status: 429 }
    );
  }

  // De-dup: if a same-type request is already pending for this table, refresh it
  // instead of stacking a duplicate the waiter has to clear twice. (Open requests
  // are the only rows that exist — accepted ones are deleted.)
  const [open] = await db
    .select({ id: serviceRequests.id })
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.tableId, ctx.tableId),
        eq(serviceRequests.type, parsed.data.type)
      )
    )
    .limit(1);

  if (open) {
    // Refresh timestamp + update the chosen payment method (diner may switch cash↔card).
    await db
      .update(serviceRequests)
      .set({ createdAt: new Date(), paymentMethod: parsed.data.paymentMethod ?? null })
      .where(eq(serviceRequests.id, open.id));
    return NextResponse.json({ ok: true });
  }

  await db.insert(serviceRequests).values({
    restaurantId: ctx.restaurantId,
    tableId: ctx.tableId,
    type: parsed.data.type,
    paymentMethod: parsed.data.paymentMethod ?? null,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
