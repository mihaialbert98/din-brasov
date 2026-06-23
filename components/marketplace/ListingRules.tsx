/**
 * Plain-language explanation of how listings work — free quota, 30-day active
 * life, 7-day expiry grace, and paid-slot one-replacement. Shown on the
 * add-listing form and the profile so the rules are always clear.
 *
 * `allowance` personalises the free-quota line (2 normal / 4 founding member).
 */
export default function ListingRules({ allowance = 2 }: { allowance?: number }) {
  return (
    <details className="rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-600 mb-6">
      <summary className="cursor-pointer select-none px-4 py-3 font-medium text-gray-800">
        Cum funcționează anunțurile?
      </summary>
      <ul className="px-4 pb-4 space-y-2 list-disc list-inside">
        <li>
          Ai <strong>{allowance} anunțuri active gratuite</strong> în același timp. Când ștergi unul
          sau expiră, se eliberează un loc și poți publica altul.
        </li>
        <li>
          Fiecare anunț este <strong>activ 30 de zile</strong>. După aceea trece automat în
          <strong> „expirat”</strong> — nu este șters imediat.
        </li>
        <li>
          Un anunț expirat rămâne <strong>7 zile</strong> în contul tău, timp în care îl poți
          <strong> reînnoi gratuit</strong>. După cele 7 zile, dacă nu îl reînnoiești, se șterge
          definitiv (împreună cu pozele).
        </li>
        <li>
          Anunțurile <strong>plătite</strong> nu ocupă din locurile gratuite. Dacă ștergi un anunț
          plătit înainte să expire, poți publica <strong>o singură înlocuire gratuită</strong> în
          locul lui, pentru zilele rămase. După acea înlocuire, slotul se închide.
        </li>
      </ul>
    </details>
  );
}
