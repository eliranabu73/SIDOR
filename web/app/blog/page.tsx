import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Footer } from "@/components/marketing/Footer";
import { getAllPosts, formatHebrewDate } from "@/lib/blog";

export const metadata: Metadata = {
  title: "הבלוג של סידור4S — מדריכי סידור עבודה, חוק, ושכר",
  description:
    "מאמרים, מדריכים והסברים על ניהול סידור משמרות, חוק עבודה ומנוחה, חישוב שכר, וכלים לעסקים ישראלים.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "הבלוג של סידור4S",
    description:
      "מאמרים, מדריכים והסברים על ניהול סידור משמרות וחוק עבודה בישראל.",
    type: "website",
    locale: "he_IL",
  },
};

export default async function BlogIndexPage() {
  const posts = await getAllPosts();

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Marketing header (mirrors landing page chrome) */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="סידור4S — דף הבית">
            <Logo size={28} />
          </Link>
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/#pricing">מחירים</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/blog">בלוג</Link>
            </Button>
            <ThemeToggle />
            <Button asChild size="sm" variant="glow">
              <Link href="/login">התחברות</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="mb-10 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            הבלוג של סידור4S
          </h1>
          <p className="mt-3 text-muted-foreground">
            מדריכים, השוואות וטיפים פרקטיים על סידור משמרות, חוק עבודה ומנוחה,
            וניהול צוות בעסק ישראלי.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group relative flex flex-col rounded-2xl border border-border bg-card p-6 transition hover:border-foreground/30 hover:shadow-lg"
            >
              <div
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-100 text-4xl dark:from-indigo-950/40 dark:to-violet-900/30"
                aria-hidden
              >
                {post.coverEmoji}
              </div>
              <h2 className="text-xl font-semibold leading-snug text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                {post.title}
              </h2>
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                {post.description}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs text-muted-foreground">
                <time dateTime={post.publishedAt}>
                  {formatHebrewDate(post.publishedAt)}
                </time>
                {post.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border bg-background px-2 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>

        {posts.length === 0 && (
          <p className="text-muted-foreground">לא נמצאו מאמרים.</p>
        )}
      </section>

      <Footer />
    </main>
  );
}
