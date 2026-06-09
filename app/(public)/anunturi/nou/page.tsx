import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Adaugă anunț" };

export default async function NouAnuntPage() {
  const session = await auth();
  if (!session) redirect("/intra");

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold font-serif text-[#1a4731] mb-8">
        Adaugă anunț nou
      </h1>
      {/* Listing form component will be added in marketplace phase */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <p className="text-gray-500">Formularul de anunț va fi disponibil în curând.</p>
      </div>
    </div>
  );
}
