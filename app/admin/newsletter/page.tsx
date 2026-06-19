import type { Metadata } from "next";
import { db } from "@/lib/db";
import { newsletterSubscribers } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { formatDate } from "@/lib/utils";
import Pagination from "@/components/ui/Pagination";
import NewsletterSendPanel from "@/components/admin/NewsletterSendPanel";
import NewsletterCampaignForm from "@/components/admin/NewsletterCampaignForm";

export const metadata: Metadata = { title: "Newsletter — Admin" };

const PAGE_SIZE = 50;

export default async function AdminNewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.pagina ?? "1"));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.status, "active"))
      .orderBy(desc(newsletterSubscribers.consentGivenAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(newsletterSubscribers).where(eq(newsletterSubscribers.status, "active")),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Newsletter</h1>
        <p className="text-sm text-gray-500">{total} abonați activi</p>
      </div>

      <NewsletterSendPanel />
      <NewsletterCampaignForm />

      <h2 className="text-lg font-semibold text-gray-700 mb-3">Abonați activi</h2>

      {rows.length === 0 ? (
        <p className="text-gray-500 py-12 text-center">Niciun abonat activ momentan.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Categorii</th>
                <th className="px-4 py-3 font-medium">Sursă</th>
                <th className="px-4 py-3 font-medium">Confirmat</th>
                <th className="px-4 py-3 font-medium">Consimțământ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 text-gray-900">{s.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.wantsNews && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">Știri</span>}
                      {s.wantsEvents && <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Evenimente</span>}
                      {s.wantsPlaces && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Localuri</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.userId ? "Cont" : "Anonim"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.verifiedAt ? formatDate(s.verifiedAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(s.consentGivenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        buildHref={(p) => `/admin/newsletter${p > 1 ? `?pagina=${p}` : ""}`}
      />
    </div>
  );
}
