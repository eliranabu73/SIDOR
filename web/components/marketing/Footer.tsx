"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AtSign, Globe, Share2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function Footer() {
  const [email, setEmail] = useState("");

  function onSubscribe(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    toast.info("רישום בקרוב");
    setEmail("");
  }

  return (
    <footer className="border-t border-border bg-slate-50 px-4 py-16 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <Logo size={32} />
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              סידור משמרות חכם לעסקים ישראלים — תואם חוק, שולח בוואטסאפ, חוסך
              שעות.
            </p>
            <div className="mt-5 flex items-center gap-3">
              {socials.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground hover:border-foreground/30"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">מוצר</h4>
            <ul className="space-y-2 text-sm">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">מקורות</h4>
            <ul className="space-y-2 text-sm">
              {resourceLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">
              ניוזלטר חודשי
            </h4>
            <p className="mb-3 text-sm text-muted-foreground">
              טיפים על ניהול צוות, חוק עבודה, ועדכוני מוצר.
            </p>
            <form
              onSubmit={onSubscribe}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <label htmlFor="newsletter-email" className="sr-only">
                כתובת אימייל
              </label>
              <Input
                id="newsletter-email"
                type="email"
                required
                placeholder="you@email.co.il"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" size="sm">
                הירשם
              </Button>
            </form>
          </div>
        </div>

        {/* Trust badges */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3 border-t border-border/60 pt-8">
          <Badge variant="outline" className="gap-1 border-border">
            <ShieldCheck className="h-3 w-3" />
            SOC2 Ready
          </Badge>
          <Badge variant="outline" className="gap-1 border-border">
            <ShieldCheck className="h-3 w-3" />
            GDPR Ready
          </Badge>
          <Badge variant="outline" className="gap-1 border-border">
            <ShieldCheck className="h-3 w-3" />
            תואם חוק עבודה ומנוחה
          </Badge>
        </div>

        {/* Bottom row */}
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>
            © {new Date().getFullYear()} כל הזכויות שמורות לסידור4S בע״מ
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/terms" className="hover:text-foreground">
              תקנון
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              פרטיות
            </Link>
            <Link href="/contact" className="hover:text-foreground">
              צור קשר
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
