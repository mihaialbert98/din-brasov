"use client";

/**
 * Newsletter subscription banner for non-authenticated visitors.
 *
 * GDPR-compliant: all checkboxes start UNCHECKED (consent = affirmative action,
 * CJEU Planet49). Double opt-in — submitting only sends a verification email.
 *
 * Never overlaps the cookie banner: only appears AFTER a cookie choice exists,
 * sits at z-40 (below the cookie banner's z-50), and shows after a short delay.
 */

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getStoredConsent } from "@/components/cookie-consent/CookieBanner";

const DISMISS_KEY = "newsletter_dismissed_v1";
const DISMISS_VALIDITY_DAYS = 30;
const BANNER_VERSION = "1.0";
const SHOW_DELAY_MS = 20_000;

function recentlyDismissed(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(DISMISS_KEY);
  if (!stored) return false;
  const age = (Date.now() - parseInt(stored)) / (1000 * 60 * 60 * 24);
  return age < DISMISS_VALIDITY_DAYS;
}

export function NewsletterBanner() {
  const { data: session } = useSession();
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [wantsNews, setWantsNews] = useState(false);
  const [wantsEvents, setWantsEvents] = useState(false);
  const [wantsPlaces, setWantsPlaces] = useState(false);
  const [wantsExperiences, setWantsExperiences] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot — real users leave empty
  // When the full banner is closed (dismissed or after a successful subscribe),
  // we show a small floating pill so users can re-open it any time.
  const [showPill, setShowPill] = useState(false);
  // After a successful subscribe we don't nag with the pill at all.
  const [subscribed, setSubscribed] = useState(false);

  // For logged-in users we load their existing newsletter preferences so we can:
  //  1. hide sections they already receive (only offer what's missing),
  //  2. suppress the banner + pill entirely once they receive ALL sections.
  // `prefsReady` gates the reveal so we never flash the banner before we know.
  const isLoggedIn = !!session?.user;
  const [prefsReady, setPrefsReady] = useState(false);
  const [alreadyNews, setAlreadyNews] = useState(false);
  const [alreadyEvents, setAlreadyEvents] = useState(false);
  const [alreadyPlaces, setAlreadyPlaces] = useState(false);
  const [alreadyExperiences, setAlreadyExperiences] = useState(false);

  const subscribedToAll =
    isLoggedIn && alreadyNews && alreadyEvents && alreadyPlaces && alreadyExperiences;

  // Sections still available to add (logged-in: only the missing ones; logged-out
  // or unknown: all four).
  const availableSections = [
    { key: "news", label: "Știri", already: alreadyNews, checked: wantsNews, set: setWantsNews },
    { key: "events", label: "Evenimente", already: alreadyEvents, checked: wantsEvents, set: setWantsEvents },
    { key: "places", label: "Noutăți și oferte localuri", already: alreadyPlaces, checked: wantsPlaces, set: setWantsPlaces },
    { key: "experiences", label: "Experiențe noi", already: alreadyExperiences, checked: wantsExperiences, set: setWantsExperiences },
  ].filter((s) => !(isLoggedIn && s.already));

  // Load the logged-in user's current preferences once. Anonymous users skip this.
  useEffect(() => {
    if (!isLoggedIn) {
      setPrefsReady(true);
      return;
    }
    let cancelled = false;
    fetch("/api/newsletter/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setAlreadyNews(!!d.prefs?.wantsNews);
        setAlreadyEvents(!!d.prefs?.wantsEvents);
        setAlreadyPlaces(!!d.prefs?.wantsPlaces);
        setAlreadyExperiences(!!d.prefs?.wantsExperiences);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPrefsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    // Wait until we know the user's existing preferences before deciding.
    if (!prefsReady) return;
    // Fully subscribed → nothing left to offer: no modal, no pill.
    if (subscribedToAll) return;
    // Only consider showing once a cookie choice has been made.
    const reveal = () => {
      if (!getStoredConsent()) return;
      if (recentlyDismissed()) {
        setShowPill(true); // already dismissed before — offer the re-entry pill
      } else {
        setVisible(true);
      }
    };
    const timer = setTimeout(reveal, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [prefsReady, subscribedToAll]);

  // Prefill the email for logged-in users so they don't have to retype it. Only
  // fills an empty field, so it never overwrites an address the user typed.
  useEffect(() => {
    const sessionEmail = session?.user?.email;
    if (sessionEmail) setEmail((prev) => (prev ? prev : sessionEmail));
  }, [session?.user?.email]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
    setShowPill(true);
  }

  function reopen() {
    setShowPill(false);
    setDone(false);
    setVisible(true);
  }

  // Lock body scroll while the modal is open, and close on Escape.
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [visible]);

  // Select only the sections still on offer (for logged-in users, the ones they
  // don't already receive).
  function selectAll() {
    availableSections.forEach((s) => s.set(true));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!wantsNews && !wantsEvents && !wantsPlaces && !wantsExperiences) {
      setError("Selectează cel puțin o categorie.");
      return;
    }

    setLoading(true);
    try {
      if (isLoggedIn) {
        // Account-based: update preferences directly (pre-verified by the account,
        // no confirmation email). Merge the newly chosen sections with the ones the
        // user already receives so nothing is dropped.
        const res = await fetch("/api/newsletter/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wantsNews: alreadyNews || wantsNews,
            wantsEvents: alreadyEvents || wantsEvents,
            wantsPlaces: alreadyPlaces || wantsPlaces,
            wantsExperiences: alreadyExperiences || wantsExperiences,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "A apărut o eroare. Încearcă din nou.");
          setLoading(false);
          return;
        }
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        // Reflect the new state so the "all subscribed" suppression kicks in.
        if (wantsNews) setAlreadyNews(true);
        if (wantsEvents) setAlreadyEvents(true);
        if (wantsPlaces) setAlreadyPlaces(true);
        if (wantsExperiences) setAlreadyExperiences(true);
        setDone(true);
        setSubscribed(true);
      } else {
        // Anonymous: double opt-in via the verification email.
        const res = await fetch("/api/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, wantsNews, wantsEvents, wantsPlaces, wantsExperiences, website, bannerVersion: BANNER_VERSION }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "A apărut o eroare. Încearcă din nou.");
          setLoading(false);
          return;
        }
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        setDone(true);
        setSubscribed(true);
      }
    } catch {
      setError("A apărut o eroare. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }

  if (!visible) {
    // After dismissal, keep a subtle re-entry pill in the corner — but never
    // nag someone who already subscribed in this session, nor a logged-in user
    // who already receives every section (nothing left to offer them).
    if (showPill && !subscribed && !subscribedToAll) {
      return (
        <button
          onClick={reopen}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 bg-[#1a1a1a] text-white border border-[#c84b1e] rounded-full pl-4 pr-5 py-2.5 shadow-xl hover:bg-[#2a2a2a] transition-colors text-sm font-medium group"
          aria-label="Abonează-te la noutăți din Brașov"
        >
          <span className="text-base" aria-hidden>📬</span>
          <span>Fii la curent cu Brașovul</span>
        </button>
      );
    }
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Abonare newsletter"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-[#1a1a1a] border-2 border-[#c84b1e] rounded-2xl shadow-2xl p-6 md:p-8 text-white"
      >
        <button
          onClick={dismiss}
          aria-label="Închide"
          className="absolute top-3 right-3 text-gray-400 hover:text-white text-2xl leading-none p-1"
        >
          ✕
        </button>

        {done ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3" aria-hidden>🎉</div>
            {isLoggedIn ? (
              <>
                <h2 className="font-bold text-xl mb-2">Gata!</h2>
                <p className="text-gray-300 text-sm">
                  Preferințele tale au fost salvate. Vei primi noutățile alese direct pe email.
                </p>
              </>
            ) : (
              <>
                <h2 className="font-bold text-xl mb-2">Aproape gata!</h2>
                <p className="text-gray-300 text-sm">
                  Ți-am trimis un email de confirmare. Verifică-ți inbox-ul (și folderul Spam) și apasă pe linkul de confirmare.
                </p>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={submit}>
            {/* Honeypot: hidden from humans, tempting to bots. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="absolute left-[-9999px] w-px h-px opacity-0"
            />

            <div className="text-center mb-5">
              <div className="text-4xl mb-2" aria-hidden>📬</div>
              {isLoggedIn && availableSections.length < 4 ? (
                <>
                  <h2 className="font-bold text-xl mb-1">Mai vrei și restul?</h2>
                  <p className="text-gray-300 text-sm">
                    Ești deja abonat la o parte. Adaugă și celelalte secțiuni pe care vrei să le primești.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="font-bold text-xl mb-1">Primește ce contează din Brașov</h2>
                  <p className="text-gray-300 text-sm">
                    Știri, evenimente, localuri și experiențe noi — direct pe email, fără spam.
                  </p>
                </>
              )}
            </div>

            <div className="space-y-4">
              {/* Logged-in users subscribe with their account email — no field to
                  fill. Anonymous visitors must provide (and later confirm) one. */}
              {!isLoggedIn && (
                <div>
                  <label htmlFor="nl-email" className="sr-only">Adresă de email</label>
                  <input
                    id="nl-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="adresa@email.ro"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
                  />
                </div>
              )}

              <fieldset>
                <div className="flex items-center justify-between mb-2">
                  <legend className="text-sm text-gray-400">Vreau să primesc:</legend>
                  {availableSections.length > 1 && (
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-xs text-[#6bb5d4] underline hover:no-underline"
                    >
                      Selectează tot
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {availableSections.map((c) => (
                    <label
                      key={c.key}
                      className="flex items-center gap-3 text-sm cursor-pointer select-none bg-white/5 hover:bg-white/10 transition-colors rounded-lg px-4 py-2.5"
                    >
                      <input
                        type="checkbox"
                        checked={c.checked}
                        onChange={(e) => c.set(e.target.checked)}
                        className="w-4 h-4 accent-[#c84b1e]"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#c84b1e] text-white px-6 py-3 rounded-lg text-sm font-semibold hover:bg-[#d9603a] transition-colors disabled:opacity-60"
              >
                {loading ? "Se trimite..." : "Abonează-mă"}
              </button>
            </div>

            {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}

            <p className="text-gray-500 text-xs mt-4 text-center">
              {!session && (
                <>
                  Ai cont? Preferințele se salvează automat la{" "}
                  <Link href="/cont-nou" className="text-[#6bb5d4] underline hover:no-underline">
                    crearea contului
                  </Link>
                  .{" "}
                </>
              )}
              Te poți dezabona oricând.{" "}
              <Link href="/despre#gdpr" className="text-[#6bb5d4] underline hover:no-underline">
                Politica de confidențialitate
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
