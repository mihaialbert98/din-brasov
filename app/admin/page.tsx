import { db } from "@/lib/db";
import { newsItems, listings, events, places, users, newsletterSubscribers } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin Dashboard" };

export default async function AdminPage() {
  const [newsCount, listingsCount, eventsCount, placesCount, usersCount, subscribersCount] = await Promise.all([
    db.select({ c: count() }).from(newsItems).where(eq(newsItems.status, "draft")),
    db.select({ c: count() }).from(listings).where(eq(listings.status, "active")),
    db.select({ c: count() }).from(events).where(eq(events.status, "draft")),
    db.select({ c: count() }).from(places).where(eq(places.status, "draft")),
    db.select({ c: count() }).from(users),
    db.select({ c: count() }).from(newsletterSubscribers).where(eq(newsletterSubscribers.status, "active")),
  ]);

  const cards = [
    { label: "Știri în așteptare", value: newsCount[0]?.c ?? 0, href: "/admin/stiri", color: "bg-blue-50 text-blue-700" },
    { label: "Anunțuri active", value: listingsCount[0]?.c ?? 0, href: "/admin/anunturi", color: "bg-amber-50 text-amber-700" },
    { label: "Evenimente în așteptare", value: eventsCount[0]?.c ?? 0, href: "/admin/evenimente", color: "bg-purple-50 text-purple-700" },
    { label: "Localuri în așteptare", value: placesCount[0]?.c ?? 0, href: "/admin/localuri", color: "bg-green-50 text-green-700" },
    { label: "Utilizatori totali", value: usersCount[0]?.c ?? 0, href: "/admin/utilizatori", color: "bg-gray-50 text-gray-700" },
    { label: "Abonați newsletter", value: subscribersCount[0]?.c ?? 0, href: "/admin/newsletter", color: "bg-pink-50 text-pink-700" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
        {cards.map((card) => (
          <a
            key={card.label}
            href={card.href}
            className={`${card.color} rounded-xl p-5 hover:shadow-md transition-shadow`}
          >
            <p className="text-3xl font-bold">{card.value}</p>
            <p className="text-sm font-medium mt-1">{card.label}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
