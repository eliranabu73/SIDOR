import Link from "next/link";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { Hero } from "@/components/marketing/Hero";
import { Features } from "@/components/marketing/Features";
import { SocialProof } from "@/components/marketing/SocialProof";
import { Testimonials } from "@/components/marketing/Testimonials";
import { Pricing } from "@/components/marketing/Pricing";
import { Faq } from "@/components/marketing/Faq";
import { Footer } from "@/components/marketing/Footer";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <SiteHeader />
      <Hero />
      <Features />
      <SocialProof />
      <Testimonials />
      <Pricing />
      <Faq />
      <Footer />

      {/* iOS-style sticky bottom CTA — mobile only */}
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-30 px-4"
        style={{
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(226,232,240,0.8)",
        }}
      >
        <div className="pt-3 flex flex-col gap-1.5">
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl text-white font-bold text-base transition-all active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)",
              boxShadow: "0 6px 20px rgba(37,99,235,0.35)",
            }}
          >
            התחל ניסיון חינם 14 יום
          </Link>
          <p className="text-center text-xs text-[#64748B]">ללא כרטיס אשראי · ביטול בכל עת</p>
        </div>
      </div>

      {/* Bottom padding so content isn't hidden behind sticky CTA on mobile */}
      <div className="md:hidden" style={{ height: "calc(100px + env(safe-area-inset-bottom))" }} aria-hidden />
    </main>
  );
}
