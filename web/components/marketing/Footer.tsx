"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AtSign, Globe, Share2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

const productLinks = [
  { label: "תכונות", href: "/#features" },
  { label: "מחירים", href: "/#pricing" },
  { label: "תבניות", href: "/templates" },
  { label: "דמו", href: "/schedule" },
];

const resourceLinks = [
  { label: "בלוג", href: "/blog" },
  { label: "מדריכים", href: "/guides" },
  { label: "חוק עבודה ומנוחה", href: "/compliance" },
  { label: "צ׳אט תמיכה", href: "/support" },
];

const socials = [
  { label: "Twitter", href: "https://twitter.com/", Icon: AtSign },
  { label: "LinkedIn", href: "https://linkedin.com/", Icon: Globe },
  { label: "Facebook", href: "https://facebook.com/", Icon: Share2 },
];

const TRUST_BADGES = ["SOC2 Ready", "GDPR Ready", "תואם חוק עבודה ומנוחה"];

export function Footer() {
  const [email, setEmail] = useState("");

  function onSubscribe(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    toast.info("רישום בקרוב");
    setEmail("");
  }

  return (
    <footer className="border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-16">
      <div className="mx-auto max-w-6xl">

        {/* Main grid — 1 col mobile, 2 col sm, 4 col lg */}
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">

          {/* Brand column */}
          <div className="flex flex-col items-center text-center sm:items-start sm:text-start">
            <Logo size={28} />
            <p className="mt-4 text-sm text-[#64748B] leading-relaxed max-w-[260px]">
              סידור משמרות חכם לעסקים ישראלים — תואם חוק, שולח בוואטסאפ, חוסך שעות.
            </p>
            <div className="mt-5 flex items-center gap-3 justify-center sm:justify-start">
              {socials.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition hover:text-[#0F172A] hover:border-[#64748B]"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Product links */}
          <div className="text-center sm:text-start">
            <h4 className="mb-4 text-sm font-semibold text-[#0F172A]">מוצר</h4>
            <ul className="space-y-3 text-sm">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-[#64748B] transition-colors hover:text-[#0F172A]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resource links */}
          <div className="text-center sm:text-start">
            <h4 className="mb-4 text-sm font-semibold text-[#0F172A]">מקורות</h4>
            <ul className="space-y-3 text-sm">
              {resourceLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-[#64748B] transition-colors hover:text-[#0F172A]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter */}
          <div className="text-center sm:text-start">
            <h4 className="mb-2 text-sm font-semibold text-[#0F172A]">ניוזלטר חודשי</h4>
            <p className="mb-4 text-sm text-[#64748B]">
              טיפים על ניהול צוות, חוק עבודה, ועדכוני מוצר.
            </p>
            <form onSubmit={onSubscribe} className="flex flex-col gap-2">
              <label htmlFor="newsletter-email" className="sr-only">
                כתובת אימייל
              </label>
              <input
                id="newsletter-email"
                type="email"
                required
                placeholder="you@email.co.il"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-[#6366F1]/30"
                style={{
                  background: "#ffffff",
                  border: "1px solid #E2E8F0",
                  color: "#0F172A",
                }}
              />
              <Button type="submit" size="sm" className="w-full h-11">
                הירשם לניוזלטר
              </Button>
            </form>
          </div>
        </div>

        {/* Trust badges */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-2 border-t border-[#E2E8F0] pt-8">
          {TRUST_BADGES.map((badge) => (
            <div
              key={badge}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#475569]"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[#10B981]" />
              {badge}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-[#E2E8F0] pt-6 text-xs text-[#64748B] sm:flex-row">
          <p className="text-center sm:text-start">
            © {new Date().getFullYear()} כל הזכויות שמורות לסידור4S בע״מ
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/terms" className="hover:text-[#0F172A] transition-colors">
              תקנון
            </Link>
            <Link href="/privacy" className="hover:text-[#0F172A] transition-colors">
              פרטיות
            </Link>
            <Link href="/contact" className="hover:text-[#0F172A] transition-colors">
              צור קשר
            </Link>
          </nav>
        </div>

      </div>
    </footer>
  );
}
