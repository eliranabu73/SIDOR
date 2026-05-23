import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
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
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="סידור4S — דף הבית">
            <Logo size={28} />
          </Link>
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="#pricing">מחירים</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/schedule">דמו</Link>
            </Button>
            <ThemeToggle />
            <Button asChild size="sm" variant="glow">
              <Link href="/login">התחברות</Link>
            </Button>
          </nav>
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
