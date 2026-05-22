import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Hero } from "@/components/marketing/Hero";
import { Features } from "@/components/marketing/Features";
import { SocialProof } from "@/components/marketing/SocialProof";
import { Pricing } from "@/components/marketing/Pricing";
import { Footer } from "@/components/marketing/Footer";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-foreground"
          >
            סידור<span className="text-primary">4S</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="#pricing">מחירים</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/schedule">דמו</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login">התחברות</Link>
            </Button>
          </nav>
        </div>
      </header>
      <Hero />
      <Features />
      <SocialProof />
      <Pricing />
      <Footer />
    </main>
  );
}
