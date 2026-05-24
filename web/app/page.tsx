import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Hero } from "@/components/marketing/Hero";
import { CustomerLogos } from "@/components/marketing/CustomerLogos";
import { Features } from "@/components/marketing/Features";
import { SocialProof } from "@/components/marketing/SocialProof";
import { Testimonials } from "@/components/marketing/Testimonials";
import { Pricing } from "@/components/marketing/Pricing";
import { Faq } from "@/components/marketing/Faq";
import { Footer } from "@/components/marketing/Footer";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <header
        className="sticky top-0 z-40"
        style={{
          height: "72px",
          background: "rgba(255,255,255,0.8)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(15,23,42,0.08)",
        }}
      >
        <div className="max-w-[1400px] w-full mx-auto px-6 flex items-center h-full justify-between">
          <Link href="/" aria-label="סידור4S — דף הבית">
            <Logo size={28} />
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="#features"
              className="px-4 py-2 text-sm font-medium text-[#475569] hover:text-[#0F172A] rounded-xl transition-colors hover:bg-[#F1F5F9]"
            >
              תכונות
            </Link>
            <Link
              href="#pricing"
              className="px-4 py-2 text-sm font-medium text-[#475569] hover:text-[#0F172A] rounded-xl transition-colors hover:bg-[#F1F5F9]"
            >
              מחירים
            </Link>
            <Link
              href="/schedule"
              className="px-4 py-2 text-sm font-medium text-[#475569] hover:text-[#0F172A] rounded-xl transition-colors hover:bg-[#F1F5F9]"
            >
              דמו
            </Link>
            <Link
              href="#resources"
              className="px-4 py-2 text-sm font-medium text-[#475569] hover:text-[#0F172A] rounded-xl transition-colors hover:bg-[#F1F5F9]"
            >
              משאבים
            </Link>
            <Link
              href="#about"
              className="px-4 py-2 text-sm font-medium text-[#475569] hover:text-[#0F172A] rounded-xl transition-colors hover:bg-[#F1F5F9]"
            >
              אודות
            </Link>
          </nav>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-l from-[#2563EB] to-[#06B6D4] text-white text-sm font-semibold shadow-[0_4px_14px_rgba(37,99,235,0.3)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.4)] transition-all hover:-translate-y-px"
          >
            התחל חינם
          </Link>
        </div>
      </header>
      <Hero />
      <CustomerLogos />
      <Features />
      <SocialProof />
      <Testimonials />
      <Pricing />
      <Faq />
      <Footer />
    </main>
  );
}
