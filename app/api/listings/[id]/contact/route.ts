import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings, conversations, messages, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { detectUrls, checkMessageLimit } from "@/lib/rate-limit";

const schema = z.object({
  body: z.string().min(5).max(2000),
  formLoadedAt: z.number(),
  honeypot: z.string().max(0).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Trebuie să fii autentificat pentru a trimite un mesaj." },
      { status: 401 }
    );
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  // Honeypot + timing — silent discard for both so bots can't distinguish
  if (
    (parsed.data.honeypot && parsed.data.honeypot.length > 0) ||
    Date.now() - parsed.data.formLoadedAt < 2000
  ) {
    return NextResponse.json({ ok: true });
  }

  const { id } = await params;

  const [listing] = await db
    .select({ id: listings.id, sellerId: listings.sellerId, status: listings.status })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);

  if (!listing || listing.status !== "active" || !listing.sellerId) {
    return NextResponse.json({ error: "Anunț negăsit sau inactiv." }, { status: 404 });
  }

  if (listing.sellerId === session.user.id) {
    return NextResponse.json({ error: "Nu poți contacta propriul anunț." }, { status: 400 });
  }

  const [buyer] = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const { allowed, reason } = await checkMessageLimit(
    session.user.id,
    buyer?.createdAt ?? new Date()
  );
  if (!allowed) {
    return NextResponse.json({ error: reason ?? "Limită de mesaje atinsă." }, { status: 429 });
  }

  const hasUrl = detectUrls(parsed.data.body);

  // Atomic: find-or-create conversation + insert message in one transaction
  const conversationId = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.listingId, id), eq(conversations.buyerId, session.user!.id!)))
      .limit(1);

    let convId: string;
    if (existing) {
      convId = existing.id;
    } else {
      const [created] = await tx
        .insert(conversations)
        .values({ listingId: id, buyerId: session.user!.id!, sellerId: listing.sellerId! })
        .returning({ id: conversations.id });
      convId = created.id;
    }

    await tx.insert(messages).values({
      conversationId: convId,
      senderId: session.user!.id!,
      body: parsed.data.body,
      hasUrl,
      status: hasUrl ? "flagged" : "delivered",
    });

    return convId;
  });

  return NextResponse.json({ ok: true, conversationId });
}
