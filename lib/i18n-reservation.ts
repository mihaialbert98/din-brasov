/**
 * RO/EN strings for the public restaurant surfaces: the Localuri restaurant page and
 * the reservation form.
 *
 * Shape: one object per language. Plain strings for fixed labels, functions for the
 * sentences the form assembles at runtime — those can't be word-for-word swaps because
 * Romanian carries agreement English doesn't (`persoană/persoane`, `ora/orele`), and
 * the two languages order the clauses differently.
 *
 * `ro` is the source of truth: `en` is typed as `Dict`, so TypeScript fails the build
 * if a key is missing, renamed, or has the wrong signature. No i18n dependency —
 * this mirrors the tiny `t(ro, en)` helper the menu already uses, scaled up.
 *
 * Language comes from `?lang=en` so the choice survives navigation (QR menu →
 * "Rezervă o masă") and is shareable. See lib/seo.ts: every page emits a canonical
 * without query strings, so this adds no duplicate-content risk.
 */
import type { BookingRefusal } from "@/lib/reservations";

export type Lang = "ro" | "en";

/** Read the language off a Next.js searchParams bag. Anything unknown falls back to RO. */
export function langFrom(value: string | string[] | undefined): Lang {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "en" ? "en" : "ro";
}

/** Append the language to an internal href so it carries across navigation. */
export function withLang(href: string, lang: Lang): string {
  if (lang === "ro") return href;
  return href.includes("?") ? `${href}&lang=en` : `${href}?lang=en`;
}

const ro = {
  // ── Restaurant page ───────────────────────────────────────────────────────
  seeMenu: "Vezi meniul",
  bookTable: "Rezervă o masă",
  address: "Adresă",
  phone: "Telefon",
  website: "Site",
  backTo: (name: string) => `Înapoi la ${name}`,
  openInMaps: "Deschide în Google Maps",
  viewOnMap: "Vezi pe hartă",

  // ── Reservation form: steps ───────────────────────────────────────────────
  bookATable: "Rezervă o masă",
  howManyPeople: "Câte persoane?",
  whichDay: "În ce zi?",
  orPickDate: "sau alege data:",
  whatTime: "La ce oră?",
  whereToSit: "Unde vrei să stai?",
  inside: "Interior",
  outside: "Terasă",
  today: "Azi",
  tomorrow: "Mâine",
  weekdays: ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"],

  // ── Reservation form: contact ─────────────────────────────────────────────
  name: "Nume",
  phoneField: "Telefon",
  email: "Email",
  emailOptional: "Email (opțional)",
  emailAccount: "Email (contul tău)",
  notes: "Mențiuni",
  optional: "opțional",
  submitAuto: "Rezervă masa",
  submitManual: "Trimite cererea de rezervare",
  submitting: "Se trimite…",

  // ── Account prompts ───────────────────────────────────────────────────────
  createFreeAccount: "Creează un cont gratuit",
  createAccountBlurb:
    "Îți gestionezi rezervările (le vezi și le anulezi) și, dacă vrei, primești oferte de la restaurantele din Brașov — totul din contul tău.",
  createAccountCta: "Creează cont gratuit",
  haveAccount: "Ai un cont?",
  signIn: "Conectează-te",
  or: "sau",
  createAccount: "Creează cont",
  manageBookingsHint: "ca să-ți gestionezi rezervările — dar poți rezerva și fără cont.",
  close: "Închide",

  // ── Member card + remaining form copy ─────────────────────────────────────
  bookingInAccount: "Rezervarea e în contul tău",
  memberFindConfirmed:
    "O găsești oricând apăsând pe numele tău din colțul de sus → Rezervări, de unde o poți vedea sau anula.",
  memberFindPending:
    "Poți urmări starea rezervării apăsând pe numele tău din colțul de sus → Rezervări, de unde o poți și gestiona.",
  seeMyBookings: "Vezi rezervările mele",
  notePlaceholder: "Ex: masă la geam, scaun pentru copil…",
  emailNoteManual: "Îți trimitem pe email confirmarea sau refuzul rezervării.",
  emailNoteAuto: "Îți trimitem confirmarea pe email dacă îl completezi.",
  emailWarnManual:
    "Fără email, nu vei ști imediat dacă restaurantul acceptă rezervarea — vei fi contactat telefonic de un membru al echipei. Completează emailul ca să primești confirmarea automat.",
  newsletterOptIn:
    "Vreau să fiu la curent cu Brașovul — evenimente din oraș și oferte de la localuri, direct pe email. Mă pot dezabona oricând.",
  newsletterNeedsEmail: "Adaugă emailul mai sus ca să te putem abona.",
  manualNoteEmail: "Rezervarea va fi confirmată de restaurant — primești un email cu răspunsul.",
  manualNotePhone: "Rezervarea va fi confirmată de restaurant telefonic.",

  // ── Reservation form: notices ─────────────────────────────────────────────
  lateNotice:
    "Te rugăm să ajungi la timp. Dacă întârzii mai mult de 15 minute față de ora rezervării, aceasta poate fi anulată.",
  searchingTimes: "Se caută orele disponibile…",
  noTimes: (party: number, area: "inside" | "outside" | null) =>
    `Nicio oră disponibilă pentru ${party} pers.${area ? (area === "inside" ? " la interior" : " la terasă") : ""} în această zi.`,
  tryAnotherDay: " Încearcă altă zi sau un grup mai mic.",
  otherAreaHint: (area: "inside" | "outside") =>
    ` Dar ai locuri ${area === "inside" ? "pe terasă" : "la interior"} — `,
  switchArea: "schimbă zona",
  longPartyNoRoom: (party: number, dur: string) =>
    ` Pentru ${party} persoane rezervăm masa ${dur}, iar azi nu mai avem un interval liber atât de lung. Încearcă altă zi sau un grup mai mic.`,

  // ── Duration + reduced slots ──────────────────────────────────────────────
  fullDurationIntro: (party: number, dur: string, manySlots: boolean) =>
    `Pentru ${party} ${party === 1 ? "persoană" : "persoane"} rezervăm masa ${dur}. La ${manySlots ? "orele" : "ora"} de mai jos ai timpul întreg:`,
  reducedIntro: (manySlots: boolean, dur: string) =>
    `La ${manySlots ? "orele" : "ora"} de mai jos nu avem atât timp liber — o poți rezerva pentru ${dur}:`,
  reducedIntroStandalone: (party: number, full: string, short: string, manySlots: boolean) =>
    `Pentru ${party} ${party === 1 ? "persoană" : "persoane"} rezervăm masa ${full}. La ${manySlots ? "orele" : "ora"} de mai jos nu avem atât timp liber — o poți rezerva pentru ${short}:`,
  until: (t: string) => `până la ${t}`,
  durationPlain: (dur: string) => `Masa este rezervată ${dur}.`,
  durationLarge: (from: number, dur: string) =>
    `Pentru grupuri de ${from}+ persoane, masa este rezervată ${dur}.`,
  durationChosen: (dur: string, from: string, to: string) =>
    `Masa este rezervată ${dur} — de la ${from} până la ${to}.`,

  // ── Date picker refusals ──────────────────────────────────────────────────
  datePast: "Data a trecut. Alege o zi din viitor.",
  dateTooFar: (days: number) => `Poți rezerva cu cel mult ${days} de zile înainte.`,
  dateClosedWeekday: "Restaurantul e închis în această zi.",
  dateClosedPeriod: "Restaurantul nu primește rezervări în această perioadă.",
  firstFreeDay: (label: string) => `Prima zi liberă: ${label}`,

  // ── Success screen ────────────────────────────────────────────────────────
  confirmedTitle: "Rezervare confirmată!",
  pendingTitle: "Cerere de rezervare trimisă!",
  confirmedWithEmail:
    "Rezervarea ta este confirmată — poți sta liniștit, totul e în regulă. Vei primi în câteva minute un email de confirmare (verifică și folderul Spam/Promoții dacă nu îl găsești).",
  confirmedNoEmail: (restaurant: string) =>
    `Rezervarea ta este confirmată — poți sta liniștit, totul e în regulă. Te așteptăm la ${restaurant}.`,
  pendingWithEmail: (restaurant: string) =>
    `Cererea ta de rezervare a fost trimisă. Vei primi un email de confirmare imediat ce ${restaurant} acceptă rezervarea (verifică și folderul Spam/Promoții).`,
  pendingNoEmail: (restaurant: string) =>
    `Cererea ta de rezervare a fost trimisă. ${restaurant} te va contacta telefonic pentru a-ți confirma rezervarea.`,
  profileHintConfirmed:
    " Îți poți vedea rezervarea oricând dacă apeși pe numele tău din colțul din dreapta sus și mergi la Rezervări.",
  profileHintPending:
    " Poți urmări starea rezervării apăsând pe numele tău din colțul din dreapta sus și mergând la Rezervări, de unde o poți și gestiona.",

  // ── Errors ────────────────────────────────────────────────────────────────
  genericError: "Eroare. Încearcă din nou.",
  fillNamePhone: "Completează numele și telefonul.",

  /** Server refusals, by stable code — never string-matched. */
  refusal: (r: BookingRefusal): string => {
    switch (r.code) {
      case "party_size": return `Numărul de persoane trebuie să fie între 1 și ${r.max}.`;
      case "area_required": return "Alege zona (interior sau terasă).";
      case "date_past": return "Data a trecut. Alege o zi din viitor.";
      case "date_too_far": return `Poți rezerva cu cel mult ${r.advanceDays} de zile înainte.`;
      case "date_closed": return "Restaurantul nu primește rezervări în această zi. Alege altă dată.";
      case "no_table": return "Nu mai avem o masă liberă pentru acest număr de persoane la ora aleasă. Alege altă oră.";
      case "slot_taken": return "Ora selectată nu mai este disponibilă. Alege altă oră.";
    }
  },

  /** 90 → "1 oră 30 min" */
  duration: (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return [h === 0 ? "" : h === 1 ? "1 oră" : `${h} ore`, m === 0 ? "" : `${m} min`].filter(Boolean).join(" ");
  },
  people: (n: number) => `${n} ${n === 1 ? "persoană" : "persoane"}`,
  dateLocale: "ro-RO",
};

type Dict = typeof ro;

const en: Dict = {
  seeMenu: "View the menu",
  bookTable: "Book a table",
  address: "Address",
  phone: "Phone",
  website: "Website",
  backTo: (name: string) => `Back to ${name}`,
  openInMaps: "Open in Google Maps",
  viewOnMap: "View on map",

  bookATable: "Book a table",
  howManyPeople: "How many people?",
  whichDay: "Which day?",
  orPickDate: "or pick a date:",
  whatTime: "What time?",
  whereToSit: "Where would you like to sit?",
  inside: "Inside",
  outside: "Terrace",
  today: "Today",
  tomorrow: "Tomorrow",
  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],

  name: "Name",
  phoneField: "Phone",
  email: "Email",
  emailOptional: "Email (optional)",
  emailAccount: "Email (your account)",
  notes: "Notes",
  optional: "optional",
  submitAuto: "Book the table",
  submitManual: "Send booking request",
  submitting: "Sending…",

  createFreeAccount: "Create a free account",
  createAccountBlurb:
    "Manage your bookings (view and cancel them) and, if you like, get offers from Brașov restaurants — all from your account.",
  createAccountCta: "Create a free account",
  haveAccount: "Already have an account?",
  signIn: "Sign in",
  or: "or",
  createAccount: "Create account",
  manageBookingsHint: "to manage your bookings — though you can book without an account.",
  close: "Close",

  bookingInAccount: "Your booking is in your account",
  memberFindConfirmed:
    "You can find it any time by tapping your name in the top corner → Reservations, where you can view or cancel it.",
  memberFindPending:
    "You can follow its status by tapping your name in the top corner → Reservations, where you can also manage it.",
  seeMyBookings: "See my bookings",
  notePlaceholder: "e.g. table by the window, high chair…",
  emailNoteManual: "We'll email you the restaurant's answer, whether it's a yes or a no.",
  emailNoteAuto: "We'll email your confirmation if you add an address.",
  emailWarnManual:
    "Without an email you won't know straight away whether the restaurant accepts — someone from the team will call you instead. Add an email to get the confirmation automatically.",
  newsletterOptIn:
    "Keep me up to date with Brașov — city events and offers from local venues, by email. I can unsubscribe any time.",
  newsletterNeedsEmail: "Add your email above so we can subscribe you.",
  manualNoteEmail: "The restaurant will confirm your booking — you'll get an email with their answer.",
  manualNotePhone: "The restaurant will confirm your booking by phone.",

  lateNotice:
    "Please arrive on time. If you are more than 15 minutes late, your booking may be cancelled.",
  searchingTimes: "Looking for available times…",
  noTimes: (party: number, area: "inside" | "outside" | null) =>
    `No times available for ${party} ${party === 1 ? "person" : "people"}${area ? (area === "inside" ? " inside" : " on the terrace") : ""} on this day.`,
  tryAnotherDay: " Try another day or a smaller group.",
  otherAreaHint: (area: "inside" | "outside") =>
    ` There is room ${area === "inside" ? "on the terrace" : "inside"} though — `,
  switchArea: "switch area",
  longPartyNoRoom: (party: number, dur: string) =>
    ` For ${party} people we hold the table for ${dur}, and there is no free stretch that long today. Try another day or a smaller group.`,

  // English agrees the VERB as well as the noun — "the time below gives" vs
  // "the times below give". Romanian only inflects the noun (ora/orele).
  fullDurationIntro: (party: number, dur: string, manySlots: boolean) =>
    `For ${party} ${party === 1 ? "person" : "people"} we hold the table for ${dur}. The ${manySlots ? "times below give" : "time below gives"} you the full stay:`,
  reducedIntro: (manySlots: boolean, dur: string) =>
    `The ${manySlots ? "times below don't" : "time below doesn't"} have that much free — you can book for ${dur}:`,
  reducedIntroStandalone: (party: number, full: string, short: string, manySlots: boolean) =>
    `For ${party} ${party === 1 ? "person" : "people"} we hold the table for ${full}. The ${manySlots ? "times below don't" : "time below doesn't"} have that much free — you can book for ${short}:`,
  until: (t: string) => `until ${t}`,
  durationPlain: (dur: string) => `The table is held for ${dur}.`,
  durationLarge: (from: number, dur: string) =>
    `For groups of ${from} or more, the table is held for ${dur}.`,
  durationChosen: (dur: string, from: string, to: string) =>
    `The table is held for ${dur} — from ${from} until ${to}.`,

  datePast: "That date has passed. Please pick a future day.",
  dateTooFar: (days: number) => `You can book at most ${days} days ahead.`,
  dateClosedWeekday: "The restaurant is closed on this day.",
  dateClosedPeriod: "The restaurant is not taking bookings during this period.",
  firstFreeDay: (label: string) => `First available day: ${label}`,

  confirmedTitle: "Booking confirmed!",
  pendingTitle: "Booking request sent!",
  confirmedWithEmail:
    "Your booking is confirmed — you're all set. You'll get a confirmation email in a few minutes (check Spam/Promotions if you don't see it).",
  confirmedNoEmail: (restaurant: string) =>
    `Your booking is confirmed — you're all set. See you at ${restaurant}.`,
  pendingWithEmail: (restaurant: string) =>
    `Your booking request has been sent. You'll get a confirmation email as soon as ${restaurant} accepts it (check Spam/Promotions too).`,
  pendingNoEmail: (restaurant: string) =>
    `Your booking request has been sent. ${restaurant} will call you to confirm.`,
  profileHintConfirmed:
    " You can see your booking any time by tapping your name in the top right and going to Reservations.",
  profileHintPending:
    " You can follow the status by tapping your name in the top right and going to Reservations, where you can also manage it.",

  genericError: "Something went wrong. Please try again.",
  fillNamePhone: "Please fill in your name and phone number.",

  refusal: (r: BookingRefusal): string => {
    switch (r.code) {
      case "party_size": return `The number of people must be between 1 and ${r.max}.`;
      case "area_required": return "Please choose an area (inside or terrace).";
      case "date_past": return "That date has passed. Please pick a future day.";
      case "date_too_far": return `You can book at most ${r.advanceDays} days ahead.`;
      case "date_closed": return "The restaurant is not taking bookings on this day. Please pick another date.";
      case "no_table": return "We no longer have a free table for this group at that time. Please pick another time.";
      case "slot_taken": return "That time is no longer available. Please pick another one.";
    }
  },

  /** 90 → "1 hr 30 min" */
  duration: (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return [h === 0 ? "" : h === 1 ? "1 hr" : `${h} hrs`, m === 0 ? "" : `${m} min`].filter(Boolean).join(" ");
  },
  people: (n: number) => `${n} ${n === 1 ? "person" : "people"}`,
  dateLocale: "en-GB",
};

const DICTS: Record<Lang, Dict> = { ro, en };

/** The string table for a language. */
export function strings(lang: Lang): Dict {
  return DICTS[lang];
}
