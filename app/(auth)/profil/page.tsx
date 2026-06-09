import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { listings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { signOut } from "@/lib/auth";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Profilul meu" };

export default async function ProfilPage() {
  const session = await auth();
  if (!session?.user) redirect("/intra");

  const myListings = await db
    .select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      price: listings.price,
      currency: listings.currency,
      status: listings.status,
      createdAt: listings.createdAt,
    })
    .from(listings)
    .where(eq(listings.sellerId, session.user.id!))
    .orderBy(listings.createdAt);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-3xl font-bold font-serif text-[#1a4731] mb-8">Profilul meu</h1>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <p className="font-semibold text-lg">{session.user.name}</p>
        <p className="text-gray-500">{session.user.email}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Anunțurile mele</h2>
          <Link
            href="/anunturi/nou"
            className="text-sm text-[#d4820a] font-medium hover:underline"
          >
            + Adaugă anunț
          </Link>
        </div>
        {myListings.length === 0 ? (
          <p className="text-gray-500">Nu ai niciun anunț publicat.</p>
        ) : (
          <ul className="divide-y">
            {myListings.map((l) => (
              <li key={l.id} className="py-3 flex items-center justify-between">
                <Link href={`/anunturi/${l.slug}`} className="font-medium hover:underline">
                  {l.title}
                </Link>
                <span className="text-sm text-gray-500">
                  {l.status === "active"
                    ? "Activ"
                    : l.status === "sold"
                    ? "Vândut"
                    : l.status === "expired"
                    ? "Expirat"
                    : l.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full border border-gray-300 text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Deconectare
          </button>
        </form>

        <Link
          href="/profil/stergere"
          className="text-center text-sm text-red-500 hover:underline py-2"
        >
          Șterge contul meu
        </Link>
      </div>
    </div>
  );
}
