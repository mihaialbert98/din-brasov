import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { events, adminAuditLog } from "@/lib/db/schema";
import { sql, inArray } from "drizzle-orm";
import { UTApi } from "uploadthing/server";

/**
 * Delete all PAST published events in one action. An event is "past" once its end
 * (or start, when there's no end) is before now — matches the public list's
 * "upcoming only" rule. Cleans up Uploadthing cover images + audit-logs each.
 */
export async function POST() {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const pastWhere = sql`COALESCE(${events.endsAt}, ${events.startsAt}) < NOW()`;

  const items = await db
    .select({ id: events.id, imageUrl: events.imageUrl, title: events.title })
    .from(events)
    .where(pastWhere);

  if (items.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const fileKeys = items.flatMap((e) => (e.imageUrl?.includes("/f/") ? [e.imageUrl.split("/f/")[1]] : []));
  if (fileKeys.length > 0) await new UTApi().deleteFiles(fileKeys).catch(() => {});

  const adminId = session.user.id;
  await db.delete(events).where(inArray(events.id, items.map((e) => e.id)));
  await db.insert(adminAuditLog).values(
    items.map((e) => ({
      adminId,
      action: "delete_past_event",
      entityType: "event",
      entityId: e.id,
      metadataJson: JSON.stringify({ title: e.title }),
    }))
  );

  return NextResponse.json({ ok: true, deleted: items.length });
}
