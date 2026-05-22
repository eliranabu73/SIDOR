import { GitFork } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
        <p>© {new Date().getFullYear()} סידור4S · נבנה בישראל</p>
        <a
          href="https://github.com/eliranabu73/SIDOR"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 transition-colors hover:text-foreground"
        >
          <GitFork className="h-4 w-4" />
          <span>קוד פתוח ב-GitHub</span>
        </a>
      </div>
    </footer>
  );
}
