import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Auth shell for the restaurant area. Membership-level gating happens in the
 * per-restaurant [slug]/layout (which can read the slug param). proxy.ts already
 * requires a session + noindex for /restaurant/*.
 */
export default async function RestaurantAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/intra");
  return <>{children}</>;
}
