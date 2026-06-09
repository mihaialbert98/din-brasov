import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings, phoneReveals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkPhoneRevealLimit, hashIp, getIp } from "@/lib/rate-limit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Trebuie să fii autentificat pentru a vedea numărul de telefon." },
      { status: 401 }
    );
  }

  const { id } = await params;

  // Rate limit: 20 reveals per user per hour
  const allowed = await checkPhoneRevealLimit(session.user.id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Ai afișat prea multe numere de telefon. Încearcă din nou mai târziu." },
      { status: 429 }
    );
  }

  const [listing] = await db
    .select({ contactPhone: listings.contactPhone, status: listings.status })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);

  if (!listing || listing.status === "removed" || listing.status === "suspended") {
    return NextResponse.json({ error: "Anunț negăsit." }, { status: 404 });
  }

  if (!listing.contactPhone) {
    return NextResponse.json({ error: "Numărul de telefon nu este disponibil." }, { status: 404 });
  }

  // Log the reveal for anti-scraping audit
  await db.insert(phoneReveals).values({
    listingId: id,
    userId: session.user.id,
    ipHash: hashIp(getIp(req)),
  });

  return NextResponse.json({ phone: listing.contactPhone });
}
