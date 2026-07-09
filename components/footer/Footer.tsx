import Link from "next/link";
import Image from "next/image";
import { Mail } from "lucide-react";
import { INSTAGRAM_URL, FACEBOOK_URL, SUPPORT_EMAIL } from "@/lib/contact";

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

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="bg-ink text-white/70 mt-auto">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          <div>
            {/* Logo + wordmark */}
            <div className="flex items-center gap-3 mb-3">
              <span className="block w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                <Image
                  src="/logo.png"
                  alt="Din Brașov"
                  width={40}
                  height={40}
                  className="w-full h-full object-cover scale-105"
                />
              </span>
              <span className="font-serif font-semibold text-lg text-white">
                Din <span className="text-accent">Brașov</span>
              </span>
            </div>
            <p className="text-sm text-white/50 mb-4">
              Platforma comunității brașovene — știri, evenimente, localuri și anunțuri.
            </p>

            {/* Social media */}
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wider mb-2">
                Urmărește-ne
              </p>
              <div className="flex items-center gap-4">
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors group"
                  aria-label="Urmărește Din Brașov pe Instagram"
                >
                  <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#f09433] via-[#e6683c] via-[#dc2743] via-[#cc2366] to-[#bc1888] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <InstagramIcon className="w-4 h-4 text-white" />
                  </span>
                  <span>@din_brasov</span>
                </a>
                <a
                  href={FACEBOOK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors group"
                  aria-label="Urmărește Din Brașov pe Facebook"
                >
                  <span className="w-8 h-8 rounded-lg bg-[#1877f2] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <FacebookIcon className="w-4 h-4 text-white" />
                  </span>
                  <span>Facebook</span>
                </a>
              </div>
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
            <p className="text-sm text-white/50 mb-2">
              Ai nevoie de ajutor la publicarea anunțului? Sună-ne!
            </p>
            <a
              href="tel:+40770936013"
              className="text-2xl font-bold text-accent hover:text-accent-hover transition-colors tabular-nums"
              aria-label="Telefon pentru anunț asistat"
            >
              0770 936 013
            </a>
          </div>
        </div>

        {/* Collaboration invite — discreet single line before the legal bar. */}
        <div className="border-t border-white/10 pt-6 mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="text-white/50">Colaborări, evenimente sau parteneriate?</span>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Colaborare Din Brașov")}`}
            className="inline-flex items-center gap-1.5 font-medium text-accent hover:text-accent-hover transition-colors"
            aria-label={`Scrie-ne la ${SUPPORT_EMAIL}`}
          >
            <Mail className="w-4 h-4" aria-hidden="true" />
            {SUPPORT_EMAIL}
          </a>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-white/40">
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
