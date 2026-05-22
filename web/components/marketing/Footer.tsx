import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

const cols = [
  {
    title: "מוצר",
    links: [
      { label: "תכונות", href: "/#features" },
      { label: "תמחור", href: "/#pricing" },
      { label: "תבניות", href: "/templates" },
    ],
  },
  {
    title: "משפטי",
    links: [
      { label: "תנאי שימוש", href: "/terms" },
      { label: "פרטיות", href: "/privacy" },
    ],
  },
  {
    title: "קהילה",
    links: [
      { label: "GitHub", href: "https://github.com/eliranabu73/SIDOR" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-slate-50 dark:bg-slate-900 border-t border-border py-16 px-4">
      <div className="mx-auto max-w-6xl">
        <div className="flex justify-center mb-10">
          <Logo size={32} />
        </div>

        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3 mb-12">
          {cols.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-foreground mb-3">
                {col.title}
              </h4>
              <ul className="space-y-2 text-sm">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("http") ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} סידור4S · נבנה בישראל</p>
        </div>
      </div>
    </footer>
  );
}
