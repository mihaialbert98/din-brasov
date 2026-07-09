import type { Metadata } from "next";
import { SUPPORT_EMAIL, DPO_EMAIL, INSTAGRAM_URL, FACEBOOK_URL } from "@/lib/contact";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Despre noi · GDPR · Cookies",
  description:
    "Informații despre platforma Din Brașov, politica de confidențialitate (GDPR) și utilizarea cookie-urilor.",
  path: "/despre",
  section: "Despre",
});

export default function DesprePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* ── About ─────────────────────────────────────────────────────────── */}
      <section className="mb-16">
        <h1 className="text-4xl font-bold text-[#1a1a1a] mb-2">Despre Din Brașov</h1>
        <div className="w-16 h-1 bg-[#c84b1e] mb-6" />
        <p className="text-gray-700 leading-relaxed mb-4">
          <strong>Din Brașov</strong> este o platformă civică independentă dedicată comunității
          brașovene. Publicăm știri locale, evenimente, localuri noi și găzduim un spațiu de
          anunțuri pentru cumpărare și vânzare — fără roboți, fără spam.
        </p>
        <p className="text-gray-700 leading-relaxed mb-4">
          Avem o secțiune specială de <strong>anunțuri asistate</strong> pentru persoanele în
          vârstă care nu folosesc internetul: sună-ne și noi publicăm anunțul în locul tău,
          complet gratuit.
        </p>
        <p className="text-gray-700 leading-relaxed mb-5">
          Ne găsești și pe rețelele sociale:
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] text-white font-semibold px-5 py-3 rounded-xl hover:opacity-90 transition-opacity"
            aria-label="Urmărește Din Brașov pe Instagram"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            @din_brasov pe Instagram
          </a>
          <a
            href={FACEBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 bg-[#1877f2] text-white font-semibold px-5 py-3 rounded-xl hover:opacity-90 transition-opacity"
            aria-label="Urmărește Din Brașov pe Facebook"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Din Brașov pe Facebook
          </a>
        </div>
      </section>

      {/* ── GDPR / Privacy Policy ─────────────────────────────────────────── */}
      <section id="gdpr" className="mb-16 scroll-mt-20">
        <h2 className="text-3xl font-bold text-[#1a1a1a] mb-2">
          Politica de Confidențialitate
        </h2>
        <div className="w-16 h-1 bg-[#c84b1e] mb-6" />
        <p className="text-sm text-gray-400 mb-6">
          Ultima actualizare: iunie 2025 · Versiunea 1.0
        </p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">

          <div>
            <h3 className="text-xl font-semibold text-[#1a1a1a] mb-3">1. Operatorul de date</h3>
            <p>
              Operatorul datelor cu caracter personal este <strong>Din Brașov</strong>, cu sediul
              în Brașov, România. Ne poți contacta la{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#c84b1e] hover:underline">
                {SUPPORT_EMAIL}
              </a>{" "}
              sau la adresa de e-mail a responsabilului cu protecția datelor (DPO):{" "}
              <a href={`mailto:${DPO_EMAIL}`} className="text-[#c84b1e] hover:underline">
                {DPO_EMAIL}
              </a>
              .
            </p>
            <p className="mt-2">
              Autoritatea română de supraveghere este{" "}
              <strong>
                Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal
                (ANSPDCP)
              </strong>
              , cu sediul în București, Bd. G-ral. Gheorghe Magheru 28-30. Poți depune o plângere
              la{" "}
              <a
                href="https://www.dataprotection.ro"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#c84b1e] hover:underline"
              >
                dataprotection.ro
              </a>
              .
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-[#1a1a1a] mb-3">
              2. Ce date prelucrăm și de ce
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#e8d9c5]">
                    <th className="text-left p-3 font-semibold">Date</th>
                    <th className="text-left p-3 font-semibold">Scop</th>
                    <th className="text-left p-3 font-semibold">Temei legal</th>
                    <th className="text-left p-3 font-semibold">Retenție</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="p-3">Nume, email, parolă (hash)</td>
                    <td className="p-3">Creare și gestionare cont</td>
                    <td className="p-3">Contract (Art. 6(1)(b) GDPR)</td>
                    <td className="p-3">Până la ștergerea contului + 30 zile</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="p-3">Titlu, descriere, preț, locație anunț</td>
                    <td className="p-3">Publicare anunț pe platformă</td>
                    <td className="p-3">Contract (Art. 6(1)(b) GDPR)</td>
                    <td className="p-3">30 zile activ + 12 luni după expirare</td>
                  </tr>
                  <tr>
                    <td className="p-3">Telefon, email din anunț</td>
                    <td className="p-3">Contact între cumpărător și vânzător</td>
                    <td className="p-3">Consimțământ (Art. 6(1)(a) GDPR)</td>
                    <td className="p-3">Anulat la expirarea anunțului</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="p-3">Titlu, rezumat, sursă articol de știri</td>
                    <td className="p-3">Agregare știri locale Brașov</td>
                    <td className="p-3">
                      Interes legitim (Art. 6(1)(f)) + scop jurnalistic (Art. 7, Legea
                      190/2018)
                    </td>
                    <td className="p-3">24 luni de la publicare</td>
                  </tr>
                  <tr>
                    <td className="p-3">Jurnal consimțământ cookie</td>
                    <td className="p-3">Dovada consimțământului (Art. 7(1) GDPR)</td>
                    <td className="p-3">Obligație legală (Art. 6(1)(c) GDPR)</td>
                    <td className="p-3">13 luni</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="p-3">
                      Jurnal consimțământ verbal (anunțuri asistate)
                    </td>
                    <td className="p-3">
                      Documentarea consimțământului verbal al apelantului
                    </td>
                    <td className="p-3">Obligație legală (Art. 6(1)(c) GDPR)</td>
                    <td className="p-3">
                      Durata anunțului + 3 ani (termen de prescripție Cod Civil)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3">Jurnal acțiuni admin</td>
                    <td className="p-3">Responsabilitate și audit GDPR</td>
                    <td className="p-3">Obligație legală (Art. 6(1)(c) GDPR)</td>
                    <td className="p-3">5 ani</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-[#1a1a1a] mb-3">
              3. Vârsta minimă — Legea 190/2018
            </h3>
            <p>
              Conform <strong>Art. 5 din Legea 190/2018</strong> (implementarea română a GDPR),
              vârsta minimă pentru consimțământul digital în România este de{" "}
              <strong>16 ani</strong>. Dacă ai sub 16 ani, este necesar consimțământul unui
              părinte sau tutore legal pentru a crea un cont sau a publica anunțuri.
            </p>
            <p className="mt-2">
              Nu colectăm în mod intenționat date de la copii sub 16 ani fără consimțământ
              parental. Dacă descoperi că un minor a creat un cont fără acordul părintelui,
              te rugăm să ne contactezi la{" "}
              <a href={`mailto:${DPO_EMAIL}`} className="text-[#c84b1e] hover:underline">
                {DPO_EMAIL}
              </a>
              .
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-[#1a1a1a] mb-3">
              4. Anunțuri asistate — consimțământ verbal
            </h3>
            <p>
              Pentru persoanele care sună pentru a publica un anunț prin intermediul echipei
              noastre, consimțământul verbal este valid conform{" "}
              <strong>Considerentului 32 GDPR</strong>. Totuși, conform{" "}
              <strong>Art. 7(1) GDPR</strong>, sarcina probei revine operatorului.
            </p>
            <p className="mt-2">De aceea, documentăm fiecare apel:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>Numele și telefonul apelantului</li>
              <li>Data și ora apelului</li>
              <li>Operatorul care a preluat apelul</li>
              <li>Versiunea scriptului de consimțământ utilizat</li>
              <li>Scopurile explicate apelantului</li>
              <li>Confirmarea că dreptul de retragere a fost explicat</li>
            </ul>
            <p className="mt-2">
              Apelantul poate solicita oricând ștergerea anunțului sunând la{" "}
              <a href="tel:+40770936013" className="text-[#c84b1e] font-semibold hover:underline">
                0770 936 013
              </a>
              .
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-[#1a1a1a] mb-3">
              5. Agregarea știrilor — temei legal
            </h3>
            <p>
              Știrile sunt agregate automat din surse publice locale și trecute printr-un
              proces de revizuire înainte de publicare. Stocăm exclusiv:{" "}
              <strong>titlul, un rezumat de maxim 300 de caractere, sursa, autorul, data
              publicării și URL-ul original</strong>. Nu stocăm articolul complet.
            </p>
            <p className="mt-2">
              Temeiul legal este <strong>interesul legitim (Art. 6(1)(f) GDPR)</strong> combinat
              cu <strong>derogarea pentru scopuri jurnalistice (Art. 7, Legea 190/2018)</strong>.
              Fiecare articol include un link obligatoriu înapoi la sursa originală.
            </p>
            <p className="mt-2">
              Dacă ești jurnalist sau persoană fizică și dorești eliminarea datelor tale din
              platformă, contactează-ne la{" "}
              <a href={`mailto:${DPO_EMAIL}`} className="text-[#c84b1e] hover:underline">
                {DPO_EMAIL}
              </a>
              .
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-[#1a1a1a] mb-3">
              6. Operator asociat — anunțuri marketplace
            </h3>
            <p>
              Conform hotărârii <strong>CJUE C-492/23 (Russmedia, decembrie 2025)</strong>,
              operatorul unei platforme de anunțuri este <strong>operator asociat</strong>{" "}
              alături de utilizatorul care postează anunțul. Aceasta înseamnă că platforma
              Din Brașov poartă o responsabilitate partajată pentru legalitatea datelor
              publicate în anunțuri.
            </p>
            <p className="mt-2">
              De aceea, implementăm măsuri active: expirarea automată a anunțurilor,
              ștergerea datelor de contact la expirare, și posibilitatea de a solicita
              eliminarea oricărui anunț.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-[#1a1a1a] mb-3">
              7. Drepturile tale (Art. 15–22 GDPR)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#e8d9c5]">
                    <th className="text-left p-3 font-semibold">Drept</th>
                    <th className="text-left p-3 font-semibold">Ce înseamnă</th>
                    <th className="text-left p-3 font-semibold">Termen răspuns</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="p-3 font-medium">Acces (Art. 15)</td>
                    <td className="p-3">Obții o copie a datelor tale</td>
                    <td className="p-3">1 lună</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="p-3 font-medium">Rectificare (Art. 16)</td>
                    <td className="p-3">Corectezi datele incorecte</td>
                    <td className="p-3">Fără întârziere nejustificată</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium">Ștergere (Art. 17)</td>
                    <td className="p-3">
                      „Dreptul de a fi uitat" — ștergem contul și anonimizăm anunțurile
                    </td>
                    <td className="p-3">Max. 1 lună (ANSPDCP)</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="p-3 font-medium">Restricție (Art. 18)</td>
                    <td className="p-3">Suspendăm prelucrarea datelor tale</td>
                    <td className="p-3">Fără întârziere nejustificată</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium">Portabilitate (Art. 20)</td>
                    <td className="p-3">Primești datele în format structurat (JSON/CSV)</td>
                    <td className="p-3">1 lună</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="p-3 font-medium">Opoziție (Art. 21)</td>
                    <td className="p-3">Te opui prelucrării bazate pe interes legitim</td>
                    <td className="p-3">Imediat</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">
              Pentru a-ți exercita drepturile, accesează{" "}
              <a href="/profil/stergere" className="text-[#c84b1e] hover:underline font-medium">
                pagina de ștergere cont
              </a>{" "}
              sau contactează-ne la{" "}
              <a href={`mailto:${DPO_EMAIL}`} className="text-[#c84b1e] hover:underline">
                {DPO_EMAIL}
              </a>
              . Nu îți vom solicita documente notariale sau copii de buletin — o cerere simplă
              prin email este suficientă (ANSPDCP interzice proceduri excesiv de împovărătoare).
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-[#1a1a1a] mb-3">
              8. Notificarea încălcărilor de securitate
            </h3>
            <p>
              În cazul unui incident de securitate care implică date cu caracter personal,
              vom notifica <strong>ANSPDCP în termen de 72 de ore</strong> conform{" "}
              <strong>Art. 33 GDPR</strong> și{" "}
              <strong>Decizia ANSPDCP nr. 128/2018</strong>. Dacă incidentul prezintă un risc
              ridicat pentru drepturile tale, vei fi notificat direct, fără întârziere.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-[#1a1a1a] mb-3">
              9. Transferuri internaționale de date
            </h3>
            <p>
              Datele sunt stocate pe servere în <strong>UE (Frankfurt, Germania)</strong> —
              baza de date Neon Postgres, regiunea eu-central-1. Imaginile sunt stocate pe
              Cloudinary (CDN global, cu date procesate pe servere UE unde este disponibil).
              Email-urile tranzacționale sunt trimise prin Resend (servere UE).
            </p>
            <p className="mt-2">
              Nu transferăm date în afara Spațiului Economic European fără garanții adecvate.
            </p>
          </div>

        </div>
      </section>

      {/* ── Cookie Policy ─────────────────────────────────────────────────── */}
      <section id="cookies" className="mb-16 scroll-mt-20">
        <h2 className="text-3xl font-bold text-[#1a1a1a] mb-2">Politica de Cookie-uri</h2>
        <div className="w-16 h-1 bg-[#6bb5d4] mb-6" />
        <p className="text-sm text-gray-400 mb-6">
          Conform <strong>Legii 506/2004</strong> și <strong>GDPR</strong>
        </p>

        <div className="space-y-6 text-gray-700 leading-relaxed">
          <p>
            Un cookie este un fișier text mic stocat pe dispozitivul tău când vizitezi un site.
            Folosim cookie-uri în conformitate cu <strong>Legea nr. 506/2004</strong> privind
            prelucrarea datelor cu caracter personal și protecția vieții private în sectorul
            comunicațiilor electronice și cu <strong>GDPR</strong>.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#e8d9c5]">
                  <th className="text-left p-3 font-semibold">Categorie</th>
                  <th className="text-left p-3 font-semibold">Scop</th>
                  <th className="text-left p-3 font-semibold">Durata</th>
                  <th className="text-left p-3 font-semibold">Consimțământ necesar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="p-3 font-medium">Strict necesare</td>
                  <td className="p-3">
                    Sesiune autentificare, securitate CSRF, preferințe consimțământ
                  </td>
                  <td className="p-3">Sesiune / 30 zile</td>
                  <td className="p-3 text-green-700 font-medium">Nu</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="p-3 font-medium">Analiză (opțional)</td>
                  <td className="p-3">
                    Statistici anonime despre paginile vizitate — fără date personale
                    identificabile
                  </td>
                  <td className="p-3">12 luni</td>
                  <td className="p-3 text-[#c84b1e] font-medium">Da</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-[#e8d9c5] rounded-xl p-5">
            <p className="font-semibold text-[#1a1a1a] mb-2">Drepturile tale privind cookie-urile</p>
            <ul className="text-sm space-y-1 text-gray-700">
              <li>
                ✅ Poți <strong>refuza oricând</strong> cookie-urile neesențiale — accesul la
                platformă nu este condiționat de acceptarea cookie-urilor (nu există „cookie
                wall")
              </li>
              <li>
                ✅ Retragerea consimțământului este la fel de ușoară ca acordarea lui — șterge
                datele din browser sau contactează-ne
              </li>
              <li>
                ✅ Nu re-solicităm consimțământul timp de <strong>6 luni</strong> după refuz
                (ghid ANSPDCP)
              </li>
              <li>
                ✅ Re-consimțământul este solicitat automat după <strong>12 luni</strong>{" "}
                (ghid EDPB)
              </li>
            </ul>
          </div>

          <p className="text-sm text-gray-500">
            <strong>Amendamentul 2025 la Legea 506/2004</strong> (în curs de adoptare): platforma
            noastră este deja conformă cu noile cerințe — butonul „Refuz tot" este afișat cu
            aceeași vizibilitate ca „Accept tot", fără design înșelător.
          </p>
        </div>
      </section>

      {/* ── Contact ───────────────────────────────────────────────────────── */}
      <section id="contact" className="scroll-mt-20">
        <h2 className="text-3xl font-bold text-[#1a1a1a] mb-2">Contact</h2>
        <div className="w-16 h-1 bg-[#c84b1e] mb-6" />
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8d9c5] p-6 space-y-3 text-gray-700">
          <p>
            <strong>Platforma:</strong> Din Brașov
          </p>
          <p>
            <strong>Email general:</strong>{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#c84b1e] hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p>
            <strong>Responsabil protecția datelor (DPO):</strong>{" "}
            <a href={`mailto:${DPO_EMAIL}`} className="text-[#c84b1e] hover:underline">
              {DPO_EMAIL}
            </a>
          </p>
          <p>
            <strong>Anunț asistat (telefon):</strong>{" "}
            <a href="tel:+40770936013" className="text-[#c84b1e] font-semibold hover:underline">
              0770 936 013
            </a>
          </p>
          <p>
            <strong>Autoritatea de supraveghere (ANSPDCP):</strong>{" "}
            <a
              href="https://www.dataprotection.ro"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#c84b1e] hover:underline"
            >
              dataprotection.ro
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
