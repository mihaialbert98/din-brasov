import Link from "next/link";
import type { Metadata } from "next";
import { searchNews, searchEvents, searchListings, searchPlaces, searchExperiences } from "@/lib/search";
import NewsCard from "@/components/ui/NewsCard";
import EventCard from "@/components/ui/EventCard";
import PlaceCard from "@/components/ui/PlaceCard";
import ListingCard from "@/components/ui/ListingCard";
import ExperienceCard from "@/components/ui/ExperienceCard";
import JsonLd from "@/components/seo/JsonLd";
import { organizationJsonLd, websiteJsonLd, pageMetadata } from "@/lib/seo";
import FoundingMemberBanner from "@/components/promo/FoundingMemberBanner";
import { getFoundingSpotsLeft } from "@/lib/permissions";
import { auth } from "@/lib/auth";

const homeTitle = "Din Brașov — știri, evenimente, localuri și anunțuri";
export const metadata: Metadata = {
  ...pageMetadata({
    title: homeTitle,
    description:
      "Platforma civică a brașovenilor: ultimele știri locale, evenimente, localuri noi și anunțuri de vânzare-cumpărare din Brașov.",
    path: "/",
  }),
  // Homepage uses an absolute title (no "%s | Din Brașov" template suffix).
  title: { absolute: homeTitle },
};

export default async function HomePage() {
  const [latestNews, upcomingEvents, recentPlaces, recentListings, recentExperiences, session, spotsLeft] = await Promise.all([
    searchNews("", { page: 1 }).catch(() => []),
    searchEvents("", { page: 1 }).catch(() => []),
    searchPlaces("", { page: 1 }).catch(() => []),
    searchListings("", { page: 1 }).then((r) => r.listings).catch(() => []),
    searchExperiences("", { page: 1 }).catch(() => []),
    auth().catch(() => null),
    getFoundingSpotsLeft().catch(() => 0),
  ]);

  // Promote the founding-member offer only to logged-out visitors (the goal is signups).
  const showFounding = !session?.user && spotsLeft > 0;

  return (
    <div>
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
      {/* Hero */}
      <section className="relative bg-[#1a1a1a] text-white overflow-hidden" aria-label="Introducere">
        <div className="absolute right-0 top-0 w-[320px] sm:w-[480px] h-[320px] sm:h-[480px] rounded-full bg-[#c84b1e] opacity-20 translate-x-1/3 -translate-y-1/3 pointer-events-none" aria-hidden />
        <div className="absolute right-8 sm:right-16 top-4 sm:top-8 w-[240px] sm:w-[380px] h-[240px] sm:h-[380px] rounded-full border-2 border-[#6bb5d4] opacity-15 translate-x-1/3 -translate-y-1/3 pointer-events-none" aria-hidden />

        <div className="relative max-w-5xl mx-auto px-4 py-20 flex flex-col md:flex-row items-center gap-10">
          <div className="flex-1 text-center md:text-left">
            <a
              href="https://www.instagram.com/din_brasov/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[#6bb5d4] hover:text-white transition-colors text-sm font-medium tracking-wide mb-3"
              aria-label="Urmărește @din_brasov pe Instagram"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              @din_brasov
            </a>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 leading-tight">
              Din <span className="text-[#c84b1e]">Brașov</span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-300 mb-10 max-w-md">
              Tot ce se întâmplă în Brașov — știri, evenimente, localuri și anunțuri.
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-3">
              <Link href="/stiri" className="bg-[#c84b1e] text-white font-semibold px-6 py-3 rounded-xl hover:bg-[#d9603a] transition-colors">
                Știri
              </Link>
              <Link href="/evenimente" className="bg-white/10 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/20 transition-colors border border-white/20">
                Evenimente
              </Link>
              <Link href="/localuri" className="bg-white/10 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/20 transition-colors border border-white/20">
                Localuri
              </Link>
              <Link href="/experiente" className="bg-white/10 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/20 transition-colors border border-white/20">
                Experiențe
              </Link>
              <Link href="/anunturi" className="bg-[#6bb5d4] text-[#1a1a1a] font-semibold px-6 py-3 rounded-xl hover:bg-[#4a9ab8] hover:text-white transition-colors">
                Anunțuri
              </Link>
            </div>
          </div>

          <div className="flex-shrink-0 hidden md:block">
            <span className="block w-[220px] h-[220px] rounded-full overflow-hidden drop-shadow-2xl">
              <img src="/logo.png" alt="Din Brașov" width={220} height={220} className="w-full h-full object-cover scale-115" />
            </span>
          </div>
        </div>
      </section>

      {/* Founding-member promo (logged-out visitors, while spots remain) */}
      {showFounding && <FoundingMemberBanner spotsLeft={spotsLeft} />}

      {/* Assisted listings CTA */}
      <section className="bg-[#e8d9c5] border-y border-[#c84b1e]/20 py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
          <div className="text-5xl" aria-hidden>📞</div>
          <div>
            <h2 className="text-xl font-bold text-[#1a1a1a] mb-1">Ai nevoie de ajutor in publicare anuntului?</h2>
            <p className="text-gray-700 text-lg mb-2">Sună-ne și noi publicăm anunțul în locul tău, gratuit.</p>
            <a href="tel:+40770936013" className="text-xl sm:text-3xl font-bold text-[#c84b1e] hover:underline" aria-label="Sună pentru ajutor cu anunțul">
              0770 936 013
            </a>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-12 space-y-16">
        {/* Latest news */}
        <section aria-label="Ultimele știri">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-[#1a1a1a]">
              <span className="border-b-4 border-[#c84b1e] pb-1">Ultimele știri</span>
            </h2>
            <Link href="/stiri" className="text-[#c84b1e] font-semibold hover:underline text-sm">
              Vezi toate →
            </Link>
          </div>
          {latestNews.length === 0 ? (
            <p className="text-gray-500">Nu există știri momentan.</p>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {latestNews.slice(0, 3).map((item) => (
                <NewsCard key={item.id} item={item} compact />
              ))}
            </div>
          )}
        </section>

        {/* Upcoming events */}
        <section aria-label="Evenimente viitoare">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-[#1a1a1a]">
              <span className="border-b-4 border-[#6bb5d4] pb-1">Evenimente</span>
            </h2>
            <Link href="/evenimente" className="text-[#c84b1e] font-semibold hover:underline text-sm">
              Vezi toate →
            </Link>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="text-gray-500">Nu există evenimente programate.</p>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {upcomingEvents.slice(0, 3).map((ev) => (
                <EventCard key={ev.id} event={ev} compact />
              ))}
            </div>
          )}
        </section>

        {/* Recent places */}
        <section aria-label="Localuri noi">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-[#1a1a1a]">
              <span className="border-b-4 border-[#c84b1e] pb-1">Localuri noi</span>
            </h2>
            <Link href="/localuri" className="text-[#c84b1e] font-semibold hover:underline text-sm">
              Vezi toate →
            </Link>
          </div>
          {recentPlaces.length === 0 ? (
            <p className="text-gray-500">Nu există localuri adăugate recent.</p>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {recentPlaces.slice(0, 3).map((place) => (
                <PlaceCard key={place.id} place={place} compact />
              ))}
            </div>
          )}
        </section>

        {/* Recent experiences */}
        <section aria-label="Experiențe">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-[#1a1a1a]">
              <span className="border-b-4 border-[#6bb5d4] pb-1">Experiențe</span>
            </h2>
            <Link href="/experiente" className="text-[#c84b1e] font-semibold hover:underline text-sm">
              Vezi toate →
            </Link>
          </div>
          {recentExperiences.length === 0 ? (
            <p className="text-gray-500">Nu există experiențe disponibile momentan.</p>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {recentExperiences.slice(0, 3).map((exp) => (
                <ExperienceCard key={exp.id} experience={exp} />
              ))}
            </div>
          )}
        </section>

        {/* Recent listings */}
        <section aria-label="Anunțuri recente">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-[#1a1a1a]">
              <span className="border-b-4 border-[#6bb5d4] pb-1">Anunțuri recente</span>
            </h2>
            <Link href="/anunturi" className="text-[#c84b1e] font-semibold hover:underline text-sm">
              Vezi toate →
            </Link>
          </div>
          {recentListings.length === 0 ? (
            <p className="text-gray-500">Nu există anunțuri momentan.</p>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {recentListings.slice(0, 3).map((listing) => (
                <ListingCard key={listing.id} listing={listing} compact />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
