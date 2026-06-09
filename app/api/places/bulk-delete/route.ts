import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { places, adminAuditLog } from "@/lib/db/schema";
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

  const items = await db.select({ id: places.id, name: places.name, imagesJson: places.imagesJson })
    .from(places).where(inArray(places.id, ids));

  const fileKeys = items.flatMap((p) => {
    const imgs: string[] = p.imagesJson ? JSON.parse(p.imagesJson) : [];
    return imgs.filter((u) => u.includes("/f/")).map((u) => u.split("/f/")[1]);
  });
  if (fileKeys.length > 0) await new UTApi().deleteFiles(fileKeys).catch(() => {});

  const adminId = session.user!.id!;
  await db.delete(places).where(inArray(places.id, ids));
  await db.insert(adminAuditLog).values(
    items.map((p) => ({
      adminId,
      action: "delete_place",
      entityType: "place",
      entityId: p.id,
      metadataJson: JSON.stringify({ name: p.name }),
    }))
  );

  return NextResponse.json({ ok: true, deleted: items.length });
}
