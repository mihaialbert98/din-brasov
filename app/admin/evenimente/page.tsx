import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { eq, desc, count, and, sql } from "drizzle-orm";
import Link from "next/link";
import type { Metadata } from "next";
import Pagination from "@/components/ui/Pagination";
import EventsTable from "@/components/admin/EventsTable";
import DeletePastEventsButton from "@/components/admin/DeletePastEventsButton";

export const metadata: Metadata = { title: "Admin — Evenimente" };

const PER_PAGE = 20;

function buildHref(page: number) {
  return page === 1 ? "/admin/evenimente" : `/admin/evenimente?p=${page}`;
}

interface Props {
  searchParams: Promise<{ p?: string }>;
}

export default async function AdminEvenimentePage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.p ?? "1"));

  const pastCond = sql`COALESCE(${events.endsAt}, ${events.startsAt}) < NOW()`;

  const [[{ total }], [{ pastTotal }], published] = await Promise.all([
    db.select({ total: count() }).from(events).where(eq(events.status, "published")),
    db.select({ pastTotal: count() }).from(events).where(and(eq(events.status, "published"), pastCond)),
    db.select().from(events).where(eq(events.status, "published"))
      .orderBy(desc(events.startsAt))
      .limit(PER_PAGE).offset((page - 1) * PER_PAGE),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);
  const now = Date.now();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Evenimente ({total})</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <DeletePastEventsButton count={pastTotal} />
          <Link
            href="/admin/evenimente/nou"
            className="bg-[#c84b1e] text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#d9603a] transition-colors"
          >
            + Adaugă eveniment
          </Link>
        </div>
      </div>

      {total === 0 ? (
        <p className="text-gray-400 text-sm">Nu există evenimente. Adaugă primul!</p>
      ) : (
        <>
          <EventsTable items={published} now={now} />
          <Pagination currentPage={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      )}
    </div>
  );
}
