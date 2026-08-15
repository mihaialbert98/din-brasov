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
            adresa. La <em>Automat</em> poți alege dacă mesajul de final îi spune clientului că primește
            un email de confirmare („Anunță clientul că primește email”) — emailul pleacă oricum, se
            schimbă doar textul.
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
            <ul className="mt-1.5 space-y-1.5 list-disc pl-5 marker:text-gray-300">
              <li>
                <span className="font-medium text-gray-800">Durată mai mare pentru grupuri</span> —
                opțional. Pornești opțiunea, spui de la câte persoane se aplică și cât ține (ex: de la 6
                persoane, 2 ore). Restul rezervărilor păstrează durata obișnuită.
              </li>
              <li>
                <span className="font-medium text-gray-800">Acceptă și rezervări cu durată redusă</span> —
                bifă în aceeași secțiune. Dacă între două rezervări rămâne loc doar cât durata obișnuită,
                îi oferim totuși ora grupului, scriindu-i clar până la ce oră are masa. Fără bifă, ora nu
                apare deloc și pierzi rezervarea.
              </li>
              <li>
                <span className="font-medium text-gray-800">Arată durata rezervării</span> — dacă o
                pornești, clientul vede pe formular cât timp are masa (ex: „Masa este rezervată 2 ore”).
                E oprită implicit; pornește-o mai ales dacă ai pus durată mai mare pentru grupuri, altfel
                clienții văd mai puține ore libere fără să înțeleagă de ce.
              </li>
            </ul>
            <p className="mt-1.5">
              Fiecare rezervare reține durata cu care a fost făcută. Dacă schimbi aceste setări,
              rezervările deja făcute rămân exact cum au fost — se aplică doar celor noi.
            </p>
          </li>
          <li>
            <span className="font-medium text-gray-800">Adaugă programul.</span> Intervalele în care
            primești rezervări (zi, de la–până la) și „Start la fiecare” = cât de des poate începe o
            rezervare (la 15 sau 30 min). Poți avea două intervale în aceeași zi (ex: prânz 12–15 și seara
            18–22), atât timp cât nu se suprapun.
          </li>
          <li>
            <span className="font-medium text-gray-800">Cu cât timp înainte.</span> Cât de departe în
            viitor pot rezerva <em>clienții</em> (ex: 60 de zile). Pe tine nu te limitează: poți adăuga
            oricând o rezervare mai îndepărtată (o nuntă, o petrecere) din „Rezervări”.
          </li>
          <li>
            <span className="font-medium text-gray-800">Zile închise — opțional.</span> Marchezi o zi sau
            o perioadă (sărbători, eveniment privat, concediu) și ziua dispare din formularul clienților.
            Rezervările deja făcute <em>nu</em> se anulează — dacă în perioada aleasă există rezervări,
            îți arătăm lista cu nume și telefon ca să suni clienții, și decizi tu dacă închizi oricum.
            Tu poți adăuga în continuare rezervări telefonice în acele zile (îți cerem o confirmare).
            Ca să redeschizi o perioadă, apasă „Redeschide”.
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
              <span className="font-medium text-gray-800">Ștergi un interval?</span> Dacă are rezervări
              viitoare, îți arătăm întâi lista (cu telefoane) și îți propunem „Oprește temporar” — care e
              reversibil, spre deosebire de ștergere. Rezervările nu se anulează în niciun caz.
            </li>
            <li>
              <span className="font-medium text-gray-800">Modifică o rezervare</span> — din „Rezervări”,
              apasă „Editează” pe o rezervare ca să schimbi data, ora sau numărul de persoane. Clientul
              primește un email cu noile detalii; dacă nu are email, îți amintim să-l suni.
            </li>
            <li>
              <span className="font-medium text-gray-800">Poți depăși limitele</span> — la rezervările
              adăugate sau modificate de tine poți trece peste numărul maxim de persoane, peste
              capacitatea slotului sau peste o zi închisă. Înainte să salvezi îți arătăm cât e ocupat la
              acea oră, dacă rezervarea încape și ce durată va avea; dacă depășește, îți spunem cu cât și
              poți salva oricum.
            </li>
            <li>
              <span className="font-medium text-gray-800">Locuri păstrate pentru walk-in</span> (doar la
              „Mese individuale”) — apasă „Ține pentru walk-in” la o masă și ea dispare din formularul
              online, dar rămâne disponibilă pentru tine (rezervări telefonice, clienți care vin fără
              rezervare). E diferit de „Dezactivează”, care ascunde masa complet, inclusiv de tine.
              Dacă ajungi să ții <em>toate</em> mesele pentru walk-in (sau să le dezactivezi pe toate),
              te avertizăm: clienții nu mai pot rezerva deloc online.
            </li>
            <li>
              <span className="font-medium text-gray-800">Grupuri mari văd mai puține ore</span> — e
              normal, dacă ai pus o durată mai mare pentru ele: au nevoie de un interval liber mai lung,
              așa că o pauză de 90 de minute între două rezervări nu le încape. Cu „Acceptă și rezervări
              cu durată redusă” pornit, ora le apare totuși, într-o secțiune separată, cu mențiunea până
              la ce oră au masa.
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
            <li>
              <span className="font-medium text-gray-800">Schimbă masa unei rezervări</span> (doar la
              „Mese individuale”) — masa e aleasă automat, dar tu decizi. Din „Rezervări”, apasă
              „Schimbă masa” pe o rezervare și alegi altă masă: poate vrei să ții masa mare liberă
              pentru un grup care vine mai târziu, sau clientul a cerut masa de la fereastră.
              <ul className="mt-1.5 space-y-1.5 list-disc pl-5 marker:text-gray-300">
                <li>
                  Poți alege doar mese <span className="font-medium text-gray-800">în care încap</span> cei
                  din rezervare și care sunt <span className="font-medium text-gray-800">libere</span> în
                  intervalul ei. Îți arătăm la fiecare masă câte locuri are și, dacă e ocupată, cine o
                  ține și până la ce oră.
                </li>
                <li>
                  Poți selecta <span className="font-medium text-gray-800">mai multe mese</span> — locurile
                  se adună (ex: două mese de 4 pentru 7 persoane). Mesele de la interior nu se pot uni cu
                  cele de pe terasă.
                </li>
                <li>
                  Masa aleasă de tine <span className="font-medium text-gray-800">rămâne</span>: dacă
                  modifici ora sau numărul de persoane, nu ți-o schimbăm pe la spate. Doar dacă alegerea
                  ta nu mai e posibilă (grupul a crescut peste masă, sau la ora nouă e deja ocupată)
                  revine alegerea automată — și îți spunem clar ce s-a schimbat.
                </li>
                <li>
                  Masa aleasă de tine e o rezervare reală: nimeni altcineva nu o poate primi în acel
                  interval, la fel ca la o masă atribuită automat.
                </li>
              </ul>
            </li>
            <li>
              <span className="font-medium text-gray-800">Plan de sală</span> (doar la „Capacitate
              totală”) — dacă vrei să știi <em>cine unde stă</em>, îți poți desena sala din meniul
              „Plan de sală”: adaugi mesele cu numele tău (m1, m2, Colț fereastră…) și le grupezi pe
              secțiuni (Sala 1, Terasă, Etaj). Apoi, la o rezervare, alegi masa din „Mese”. Masa aleasă
              rămâne ocupată exact cât ține acea rezervare — inclusiv durata mai mare pentru grupuri —
              așa că nu o mai poți da din greșeală altcuiva în același interval. Când rezervarea se
              termină (sau o anulezi), masa e liberă din nou.
              <p className="mt-1.5">
                E complet opțional: nu ești obligat să faci un plan, și nici să alegi masa la fiecare
                rezervare. Rezervările funcționează la fel și fără. Nu schimbă cu nimic ce văd clienții —
                disponibilitatea rămâne cea din „Capacitate totală”, iar masa aleasă e doar pentru tine.
              </p>
              <p className="mt-1.5">
                <span className="font-medium text-gray-800">Nu confunda cele două:</span> la „Mese
                individuale”, mesele au număr de locuri și <em>ele</em> decid ce ore vede clientul, iar
                „Schimbă masa” respectă mărimea. La „Plan de sală”, mărimea mesei nu contează deloc —
                e doar o notiță pentru tine despre cine unde stă. Vezi doar una dintre ele odată, în
                funcție de modul de capacitate ales; dacă schimbi modul, cealaltă rămâne salvată și
                revine când te întorci.
              </p>
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
