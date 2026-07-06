import Link from "next/link";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="bg-[#1a1a1a] text-gray-300 mt-auto">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          <div>
            {/* Logo + wordmark */}
            <div className="flex items-center gap-3 mb-3">
              <span className="block w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                <img
                  src="/logo.png"
                  alt="Din Brașov"
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                />
              </span>
              <span className="font-bold text-lg text-white">
                Din <span className="text-[#c84b1e]">Brașov</span>
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Platforma comunității brașovene — știri, evenimente, localuri și anunțuri.
            </p>

            {/* Social media */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                Urmărește-ne
              </p>
              <a
                href="https://www.instagram.com/din_brasov/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors group"
                aria-label="Urmărește Din Brașov pe Instagram"
              >
                <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#f09433] via-[#e6683c] via-[#dc2743] via-[#cc2366] to-[#bc1888] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <InstagramIcon className="w-4 h-4 text-white" />
                </span>
                <span>@din_brasov</span>
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-3">Secțiuni</h4>
            <ul className="space-y-2 text-sm">
              {[
                { href: "/stiri", label: "Știri" },
                { href: "/evenimente", label: "Evenimente" },
                { href: "/localuri", label: "Localuri" },
                { href: "/anunturi", label: "Anunțuri" },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:text-white transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-3">Anunț Asistat</h4>
            <p className="text-sm text-gray-400 mb-2">
              Ai nevoie de ajutor in publicare anuntului? Sună-ne!
            </p>
            <a
              href="tel:+40770936013"
              className="text-2xl font-bold text-[#c84b1e] hover:text-[#d9603a] transition-colors"
              aria-label="Telefon pentru anunț asistat"
            >
              0770 936 013
            </a>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Din Brașov. Toate drepturile rezervate.</p>
          <div className="flex gap-4">
            <Link href="/despre" className="hover:text-white transition-colors">Despre noi</Link>
            <Link href="/despre#gdpr" className="hover:text-white transition-colors">GDPR</Link>
            <Link href="/despre#cookies" className="hover:text-white transition-colors">Cookie-uri</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
