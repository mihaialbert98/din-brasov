import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NouAnuntForm } from "./NouAnuntForm";
import { PAYMENTS_ENABLED } from "@/lib/payments";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Adaugă anunț" };

export default async function NouAnuntPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/intra?next=/anunturi/nou");

  const [user] = await db
    .select({ freeListingsUsed: users.freeListingsUsed })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return <NouAnuntForm freeListingsUsed={user?.freeListingsUsed ?? 0} paymentsEnabled={PAYMENTS_ENABLED} />;
}
