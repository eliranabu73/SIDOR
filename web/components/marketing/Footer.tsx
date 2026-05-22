import Link from "next/link";
import { GitFork, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-border bg-card">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-72 w-72 rounded-full bg-gradient-to-br from-indigo-500/20 to-cyan-400/15 blur-3xl"
      />
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-4">
        <div className="md:col-span-1">
          <Logo size={32} />
          <p className="mt-4 text-sm text-muted-foreground">
            כלי הסידור לעסקים ישראלים. נבנה בישראל, חוקי ישראליים, וואטסאפ.
          </p>
        </div>

        <FooterCol title="מוצר">
          <FooterLink href="/schedule">דמו חי</FooterLink>
          <FooterLink href="#pricing">מחירים</FooterLink>
          <FooterLink href="/login">התחברות</FooterLink>
        </FooterCol>

        <FooterCol title="חוקי">
          <FooterLink href="#" icon={ShieldCheck}>פרטיות</FooterLink>
          <FooterLink href="#" icon={Sparkles}>תנאי שימוש</FooterLink>
          <FooterLink href="#" icon={Mail}>צרו קשר</FooterLink>
        </FooterCol>

        <FooterCol title="פיתוח">
          <FooterLink
            href="https://github.com/eliranabu73/SIDOR"
            external
            icon={GitFork}
          >
            קוד פתוח ב-GitHub
          </FooterLink>
        </FooterCol>
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} סידור4S · נבנה בישראל</p>
          <p>v0.3 · עיצוב חדש</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <ul className="mt-3 space-y-2 text-sm">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  children,
  external,
  icon: Icon,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const content = (
    <span className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
  if (external) {
    return (
      <li>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      </li>
    );
  }
  return (
    <li>
      <Link href={href}>{content}</Link>
    </li>
  );
}
