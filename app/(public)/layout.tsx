import { Suspense } from "react";
import { Navbar } from "@/components/navbar/Navbar";
import { Footer } from "@/components/footer/Footer";
import { CookieBanner } from "@/components/cookie-consent/CookieBanner";
import { NewsletterBanner } from "@/components/newsletter/NewsletterBanner";
import { NewsletterToast } from "@/components/newsletter/NewsletterToast";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <CookieBanner />
      <NewsletterBanner />
      <Suspense fallback={null}>
        <NewsletterToast />
      </Suspense>
    </>
  );
}
