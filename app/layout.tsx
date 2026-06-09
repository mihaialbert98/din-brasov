import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Din Brașov",
    template: "%s | Din Brașov",
  },
  description: "Tot ce se întâmplă în Brașov — știri, evenimente, localuri și anunțuri.",
  openGraph: {
    siteName: "Din Brașov",
    locale: "ro_RO",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#f8f5f0] text-gray-900">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
