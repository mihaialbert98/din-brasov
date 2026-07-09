import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Phone } from "lucide-react";
import { searchNews, searchEvents, searchListings, searchPlaces, searchExperiences } from "@/lib/search";
import NewsCard from "@/components/ui/NewsCard";
import EventCard from "@/components/ui/EventCard";
import PlaceCard from "@/components/ui/PlaceCard";
import ListingCard from "@/components/ui/ListingCard";
import ExperienceCard from "@/components/ui/ExperienceCard";
import SectionHeader from "@/components/ui/SectionHeader";
import JsonLd from "@/components/seo/JsonLd";
import { organizationJsonLd, websiteJsonLd, pageMetadata } from "@/lib/seo";
import FoundingMemberBanner from "@/components/promo/FoundingMemberBanner";
import { getFoundingSpotsLeft } from "@/lib/permissions";
import { INSTAGRAM_URL, FACEBOOK_URL } from "@/lib/contact";
import { auth } from "@/lib/auth";
import { CULTURE_CATEGORY, CULTURE_HREF } from "@/lib/categories";

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
  const [latestNews, upcomingEvents, cultureEvents, recentPlaces, recentListings, recentExperiences, session, spotsLeft] = await Promise.all([
    searchNews("", { page: 1 }).then((r) => r.items).catch(() => []),
    searchEvents("", { page: 1 }).then((r) => r.items).catch(() => []),
    searchEvents("", { page: 1, category: CULTURE_CATEGORY }).then((r) => r.items).catch(() => []),
    searchPlaces("", { page: 1 }).then((r) => r.items).catch(() => []),
    searchListings("", { page: 1 }).then((r) => r.listings).catch(() => []),
    searchExperiences("", { page: 1 }).then((r) => r.items).catch(() => []),
    auth().catch(() => null),
    getFoundingSpotsLeft().catch(() => 0),
  ]);

  // Promote the founding-member offer only to logged-out visitors (the goal is signups).
  const showFounding = !session?.user && spotsLeft > 0;

  return (
    <div>
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
      {/* Hero */}
      <section className="relative bg-ink text-white overflow-hidden" aria-label="Introducere">
        {/* Quiet, off-corner brand accents — kept subtle so the type leads. */}
        <div className="absolute right-0 top-0 w-[320px] sm:w-[480px] h-[320px] sm:h-[480px] rounded-full bg-accent opacity-[0.12] translate-x-1/3 -translate-y-1/3 pointer-events-none blur-2xl" aria-hidden />
        <div className="absolute right-8 sm:right-16 top-4 sm:top-8 w-[240px] sm:w-[380px] h-[240px] sm:h-[380px] rounded-full border border-sky/20 translate-x-1/3 -translate-y-1/3 pointer-events-none" aria-hidden />

        <div className="relative max-w-5xl mx-auto px-4 py-20 md:py-24 flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-5 gap-y-2 mb-5">
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sky hover:text-white transition-colors text-sm font-medium tracking-wide"
                aria-label="Urmărește @din_brasov pe Instagram"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                @din_brasov
              </a>
              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sky hover:text-white transition-colors text-sm font-medium tracking-wide"
                aria-label="Urmărește Din Brașov pe Facebook"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Facebook
              </a>
            </div>
            <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl font-semibold mb-5 leading-[1.05] tracking-tight">
              Din <span className="text-accent">Brașov</span>
            </h1>
            <p className="text-lg sm:text-xl text-white/70 mb-10 max-w-md mx-auto md:mx-0 leading-relaxed">
              Orașul nostru, într-un singur loc — știri locale, evenimente, localuri și anunțuri de la brașoveni.
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-3">
              <Link href="/stiri" className="bg-accent text-white font-semibold px-6 py-3 rounded-xl hover:bg-accent-hover transition-colors">
                Citește știrile
              </Link>
              <Link href="/evenimente" className="bg-white/10 text-white font-medium px-5 py-3 rounded-xl hover:bg-white/15 transition-colors border border-white/15">
                Evenimente
              </Link>
              <Link href={CULTURE_HREF} className="bg-white/10 text-white font-medium px-5 py-3 rounded-xl hover:bg-white/15 transition-colors border border-white/15">
                Cultură
              </Link>
              <Link href="/localuri" className="bg-white/10 text-white font-medium px-5 py-3 rounded-xl hover:bg-white/15 transition-colors border border-white/15">
                Localuri
              </Link>
              <Link href="/experiente" className="bg-white/10 text-white font-medium px-5 py-3 rounded-xl hover:bg-white/15 transition-colors border border-white/15">
                Experiențe
              </Link>
              <Link href="/anunturi" className="bg-white/10 text-white font-medium px-5 py-3 rounded-xl hover:bg-white/15 transition-colors border border-white/15">
                Anunțuri
              </Link>
            </div>
          </div>

          <div className="flex-shrink-0 hidden md:block">
            <span className="block w-[260px] h-[260px] rounded-full overflow-hidden ring-1 ring-white/10 shadow-2xl">
              <Image src="/logo.png" alt="Din Brașov" width={260} height={260} priority className="w-full h-full object-cover scale-105" />
            </span>
          </div>
        </div>
      </section>

      {/* Founding-member promo (logged-out visitors, while spots remain) */}
      {showFounding && <FoundingMemberBanner spotsLeft={spotsLeft} />}

      {/* Assisted listings CTA — aimed at elderly callers without internet. */}
      <section className="bg-cream border-y border-accent/15 py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-5 text-center md:text-left">
          <div className="flex-shrink-0 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent" aria-hidden>
            <Phone className="h-8 w-8" />
          </div>
          <div>
            <h2 className="font-serif text-xl font-semibold text-ink mb-1">Ai nevoie de ajutor la publicarea anunțului?</h2>
            <p className="text-ink/70 text-lg mb-2">Sună-ne și publicăm anunțul în locul tău, gratuit.</p>
            <a href="tel:+40770936013" className="inline-flex items-center gap-2 text-2xl sm:text-3xl font-bold text-accent hover:text-accent-hover transition-colors tabular-nums" aria-label="Sună pentru ajutor cu anunțul">
              0770 936 013
            </a>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-16 space-y-20">
        {/* Latest news */}
        <section aria-label="Ultimele știri">
          <SectionHeader title="Ultimele știri" href="/stiri" />
          {latestNews.length === 0 ? (
            <p className="text-muted">Nu există știri momentan.</p>
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
          <SectionHeader title="Evenimente" href="/evenimente" />
          {upcomingEvents.length === 0 ? (
            <p className="text-muted">Nu există evenimente programate.</p>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {upcomingEvents.slice(0, 3).map((ev) => (
                <EventCard key={ev.id} event={ev} compact />
              ))}
            </div>
          )}
        </section>

        {/* Cultural events — only shown when there are any (no empty row). */}
        {cultureEvents.length > 0 && (
          <section aria-label="Evenimente culturale">
            <SectionHeader title="Cultură" href={CULTURE_HREF} />
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {cultureEvents.slice(0, 3).map((ev) => (
                <EventCard key={ev.id} event={ev} compact />
              ))}
            </div>
          </section>
        )}

        {/* Recent places */}
        <section aria-label="Localuri noi">
          <SectionHeader title="Localuri noi" href="/localuri" />
          {recentPlaces.length === 0 ? (
            <p className="text-muted">Nu există localuri adăugate recent.</p>
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
          <SectionHeader title="Experiențe" href="/experiente" />
          {recentExperiences.length === 0 ? (
            <p className="text-muted">Nu există experiențe disponibile momentan.</p>
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
          <SectionHeader title="Anunțuri recente" href="/anunturi" />
          {recentListings.length === 0 ? (
            <p className="text-muted">Nu există anunțuri momentan.</p>
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
