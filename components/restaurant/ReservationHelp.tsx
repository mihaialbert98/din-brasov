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
              <li>
                <span className="font-medium text-gray-800">Grupuri de mese</span> (doar la „Mese
                individuale”) — spui exact ce mese se pot alătura fizic (ex: „Masa 1–2”). Mesele dintr-un
                grup se pot uni toate între ele, chiar dacă sunt mai multe decât limita generală. Un grup
                conține mese dintr-o singură zonă.
              </li>
            </ul>
          </li>
          <li>
            <span className="font-medium text-gray-800">Zone (Interior &amp; terasă) — opțional.</span>{" "}
            Clientul alege unde vrea să stea, iar fiecare zonă are locurile (sau mesele) ei. Mesele de la
            interior nu se pot uni cu cele de pe terasă. Dacă închizi zonele la „Mese individuale”, mesele
            de pe terasă devin indisponibile (ca și cum terasa s-ar închide) — le readuci reactivând zonele.
          </li>
          <li>
            <span className="font-medium text-gray-800">Durata unei mese.</span> Cât timp ține o
            rezervare masa ocupată (ex: 90 min). O masă rezervată la 19:00 e liberă din nou după ce trece
            durata — nimeni altcineva nu o poate lua în acest timp.
          </li>
          <li>
            <span className="font-medium text-gray-800">Adaugă programul.</span> Intervalele în care
            primești rezervări (zi, de la–până la) și „Start la fiecare” = cât de des poate începe o
            rezervare (la 15 sau 30 min). Poți avea două intervale în aceeași zi (ex: prânz 12–15 și seara
            18–22), atât timp cât nu se suprapun.
          </li>
          <li>
            <span className="font-medium text-gray-800">Cu cât timp înainte.</span> Cât de departe în
            viitor pot rezerva clienții (ex: 60 de zile).
          </li>
        </ol>

        <div className="border-t border-gray-100 pt-4">
          <p className="font-semibold text-gray-800 mb-2">Pe parcurs</p>
          <ul className="space-y-2.5 list-disc pl-5 marker:text-gray-300">
            <li>
              <span className="font-medium text-gray-800">Oprește temporar un interval</span> — apasă ⏸ la
              interval (ex: joia asta nu iei rezervări). Nu se mai fac rezervări noi în el, dar rezervările
              deja făcute rămân neatinse. Apasă ▶ ca să-l repornești. Dacă toate intervalele unei zile sunt
              oprite, ziua nu mai apare deloc la clienți.
            </li>
            <li>
              <span className="font-medium text-gray-800">Modifică un interval</span> — apasă ✎ ca să
              schimbi orele, „Start la fiecare” sau locurile. Se aplică doar rezervărilor viitoare.
            </li>
            <li>
              <span className="font-medium text-gray-800">Modifică o rezervare</span> — din „Rezervări”,
              apasă „Editează” pe o rezervare ca să schimbi data, ora sau numărul de persoane. Clientul
              primește un email cu noile detalii; dacă nu are email, îți amintim să-l suni.
            </li>
            <li>
              <span className="font-medium text-gray-800">Poți depăși limitele</span> — la rezervările
              adăugate sau modificate de tine poți trece peste numărul maxim de persoane sau peste
              capacitatea slotului. Îți arătăm cu cât se depășește și poți salva oricum.
            </li>
            <li>
              <span className="font-medium text-gray-800">Dezactivează vs. șterge o masă</span> — dacă o
              masă e scoasă din uz temporar, <em>dezactiveaz-o</em>: rezervările rămân pe ea și nimeni
              altcineva nu o poate rezerva. Dacă o <em>ștergi</em>, mutăm automat rezervările viitoare pe
              alte mese libere, iar cele care nu încap îți sunt afișate ca să suni clienții.
            </li>
            <li>
              <span className="font-medium text-gray-800">Schimbi modul de capacitate?</span> Când treci pe
              „Mese individuale”, atribuim automat mese rezervărilor viitoare făcute înainte, ca să nu se
              suprarezerve. Cele care nu încap îți sunt listate.
            </li>
          </ul>
        </div>

        <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">
          <span className="font-medium text-gray-700">Important:</span> ca butonul „Rezervă o masă” să
          apară public, restaurantul trebuie să fie vizibil în Localuri — pornește „Arată în Localuri”
          din „Setări meniu”.
        </p>
      </div>
    </details>
  );
}
