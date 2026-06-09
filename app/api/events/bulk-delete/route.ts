import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { events, adminAuditLog } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { UTApi } from "uploadthing/server";

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { ids } = await req.json() as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Niciun ID." }, { status: 400 });
  }

  const items = await db.select({ id: events.id, imageUrl: events.imageUrl, title: events.title })
    .from(events).where(inArray(events.id, ids));

  const fileKeys = items.flatMap((e) => e.imageUrl?.includes("/f/") ? [e.imageUrl.split("/f/")[1]] : []);
  if (fileKeys.length > 0) await new UTApi().deleteFiles(fileKeys).catch(() => {});

  const adminId = session.user!.id!;
  await db.delete(events).where(inArray(events.id, ids));
  await db.insert(adminAuditLog).values(
    items.map((e) => ({
      adminId,
      action: "delete_event",
      entityType: "event",
      entityId: e.id,
      metadataJson: JSON.stringify({ title: e.title }),
    }))
  );

  return NextResponse.json({ ok: true, deleted: items.length });
}
