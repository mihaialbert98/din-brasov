import { db } from "@/lib/db";
import { experiences } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import Link from "next/link";
import type { Metadata } from "next";
import Pagination from "@/components/ui/Pagination";
import ExperiencesTable from "@/components/admin/ExperiencesTable";

export const metadata: Metadata = { title: "Admin — Experiențe" };

const PER_PAGE = 20;

function buildHref(page: number) {
  return page === 1 ? "/admin/experiente" : `/admin/experiente?p=${page}`;
}

interface Props {
  searchParams: Promise<{ p?: string }>;
}

export default async function AdminExperientePage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.p ?? "1"));

  const [[{ total }], published] = await Promise.all([
    db.select({ total: count() }).from(experiences).where(eq(experiences.status, "published")),
    db.select().from(experiences).where(eq(experiences.status, "published"))
      .orderBy(desc(experiences.createdAt))
      .limit(PER_PAGE).offset((page - 1) * PER_PAGE),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Experiențe ({total})</h1>
        <Link
          href="/admin/experiente/nou"
          className="bg-[#c84b1e] text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#d9603a] transition-colors"
        >
          + Adaugă experiență
        </Link>
      </div>

      {total === 0 ? (
        <p className="text-gray-400 text-sm">Nu există experiențe. Adaugă prima!</p>
      ) : (
        <>
          <ExperiencesTable items={published} />
          <Pagination currentPage={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      )}
    </div>
  );
}
