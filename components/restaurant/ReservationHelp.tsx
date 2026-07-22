import { HelpCircle } from "lucide-react";

/**
 * Collapsible "how reservations work" guide for the settings page. Native
 * <details> — accessible, no client JS. Explains the setup steps + the two
 * capacity modes so an owner isn't overwhelmed by the options.
 */
export default function ReservationHelp() {
  return (
    <details className="group bg-white border border-gray-200 rounded-xl overflow-hidden">
      <summary className="flex items-center gap-2 px-5 py-4 cursor-pointer select-none list-none">
        <HelpCircle className="w-5 h-5 text-[#c84b1e] flex-shrink-0" aria-hidden />
        <span className="font-semibold text-gray-900">Cum funcționează rezervările?</span>
        <span className="ml-auto text-gray-400 text-sm group-open:hidden">Deschide</span>
        <span className="ml-auto text-gray-400 text-sm hidden group-open:inline">Închide</span>
      </summary>

      <div className="px-5 pb-5 pt-1 text-sm text-gray-600 space-y-4 border-t border-gray-100">
        <ol className="space-y-3 list-decimal pl-5 marker:text-gray-400 marker:font-semibold">
          <li>
            <span className="font-medium text-gray-800">Activează rezervările.</span> Odată pornite,
            clienții pot rezerva de pe pagina restaurantului. (Funcția trebuie întâi activată de echipa
            Din Brașov.)
          </li>
          <li>
            <span className="font-medium text-gray-800">Alege modul de confirmare.</span>{" "}
            <em>Automat</em> = rezervarea e confirmată pe loc. <em>Manual</em> = primești o cerere și o
            confirmi sau o refuzi tu (din tab-ul „Rezervări”); clientul e anunțat pe email dacă și-a lăsat
            adresa.
          </li>
          <li>
            <span className="font-medium text-gray-800">Setează capacitatea.</span>
            <ul className="mt-1.5 space-y-1.5 list-disc pl-5 marker:text-gray-300">
              <li>
                <span className="font-medium text-gray-800">Capacitate totală</span> — spui câte locuri
                ai în total per interval. Simplu; nu ține cont de mese.
              </li>
              <li>
                <span className="font-medium text-gray-800">Mese individuale</span> — adaugi fiecare masă
                cu numărul ei de locuri. Un client vede o oră liberă doar dacă există o masă (sau o
                combinație de mese) care încape grupul lui. Bifează „se poate uni” la mesele care pot fi
                lipite; setează câte mese se pot uni maxim.
              </li>
            </ul>
          </li>
          <li>
            <span className="font-medium text-gray-800">Durata unei mese.</span> Cât timp ține o
            rezervare masa ocupată (ex: 90 min). O masă rezervată la 19:00 e liberă din nou după ce trece
            durata — nimeni altcineva nu o poate lua în acest timp.
          </li>
          <li>
            <span className="font-medium text-gray-800">Adaugă programul.</span> Intervalele în care
            primești rezervări (zi, de la–până la) și „Start la fiecare” = cât de des poate începe o
            rezervare (la 15 sau 30 min).
          </li>
          <li>
            <span className="font-medium text-gray-800">Cu cât timp înainte.</span> Cât de departe în
            viitor pot rezerva clienții (ex: 60 de zile).
          </li>
        </ol>

        <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">
          <span className="font-medium text-gray-700">Important:</span> ca butonul „Rezervă o masă” să
          apară public, restaurantul trebuie să fie vizibil în Localuri — pornește „Arată în Localuri”
          din „Setări meniu”.
        </p>
      </div>
    </details>
  );
}
