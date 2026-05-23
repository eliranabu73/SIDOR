import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Footer } from "@/components/marketing/Footer";
import { getAllPosts, getPostBySlug, formatHebrewDate } from "@/lib/blog";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: "מאמר לא נמצא — סידור4S" };

  return {
    title: `${post.title} — סידור4S`,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      locale: "he_IL",
      publishedTime: post.publishedAt,
      tags: post.tags,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    inLanguage: "he-IL",
    author: { "@type": "Organization", name: "צוות סידור4S" },
    publisher: {
      "@type": "Organization",
      name: "סידור4S",
      logo: { "@type": "ImageObject", url: "/logo-mark.svg" },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `/blog/${post.slug}`,
    },
    keywords: post.tags.join(", "),
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="סידור4S — דף הבית">
            <Logo size={28} />
          </Link>
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/blog">חזרה לבלוג</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/#pricing">מחירים</Link>
            </Button>
            <ThemeToggle />
            <Button asChild size="sm" variant="glow">
              <Link href="/login">התחברות</Link>
            </Button>
          </nav>
        </div>
      </header>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="mx-auto max-w-3xl px-6 py-14">
        {/* Header */}
        <header className="mb-10">
          <div
            className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 text-5xl dark:from-indigo-950/40 dark:to-violet-900/30"
            aria-hidden
          >
            {post.coverEmoji}
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {post.description}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>צוות סידור4S</span>
            <span aria-hidden>·</span>
            <time dateTime={post.publishedAt}>
              {formatHebrewDate(post.publishedAt)}
            </time>
            {post.tags.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border bg-card px-2 py-0.5 text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </header>

        {/* Body — basic prose styling via direct selectors */}
        <div
          className="blog-prose text-foreground"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />

        {/* CTA card */}
        <aside className="mt-14 rounded-2xl border border-border bg-gradient-to-br from-indigo-50 via-card to-violet-50 p-8 text-center dark:from-indigo-950/40 dark:via-card dark:to-violet-900/30">
          <h2 className="text-2xl font-bold">ניסיון חינם של 14 יום</h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            סידור משמרות חכם בעברית, מותאם לחוק הישראלי, בלי כרטיס אשראי. רואים
            את ההבדל בסידור הראשון.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" variant="glow">
              <Link href="/login">התחל ניסיון חינם</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/#features">לכל התכונות</Link>
            </Button>
          </div>
        </aside>
      </article>

      <Footer />

      {/* Scoped prose styles — keep here to avoid touching globals.css. */}
      <style>{`
        .blog-prose { font-size: 1.0625rem; line-height: 1.8; }
        .blog-prose h2 { font-size: 1.5rem; font-weight: 700; margin-top: 2.5rem; margin-bottom: 1rem; }
        .blog-prose h3 { font-size: 1.2rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.75rem; }
        .blog-prose p { margin-bottom: 1.1rem; }
        .blog-prose ul, .blog-prose ol { margin-bottom: 1.1rem; padding-inline-start: 1.5rem; }
        .blog-prose ul { list-style: disc; }
        .blog-prose ol { list-style: decimal; }
        .blog-prose li { margin-bottom: 0.35rem; }
        .blog-prose a { color: rgb(79 70 229); text-decoration: underline; text-underline-offset: 3px; }
        .blog-prose a:hover { color: rgb(67 56 202); }
        :where([data-theme="dark"]) .blog-prose a { color: rgb(165 180 252); }
        :where([data-theme="dark"]) .blog-prose a:hover { color: rgb(199 210 254); }
        .blog-prose strong { font-weight: 600; }
        .blog-prose code { background: rgb(241 245 249); padding: 0.1rem 0.35rem; border-radius: 0.25rem; font-size: 0.9em; direction: ltr; display: inline-block; }
        :where([data-theme="dark"]) .blog-prose code { background: rgb(30 41 59); }
        .blog-prose pre { background: rgb(241 245 249); padding: 1rem; border-radius: 0.5rem; overflow-x: auto; direction: ltr; text-align: left; margin-bottom: 1.25rem; }
        :where([data-theme="dark"]) .blog-prose pre { background: rgb(15 23 42); }
        .blog-prose pre code { background: transparent; padding: 0; }
        .blog-prose blockquote { border-inline-start: 4px solid rgb(99 102 241); padding-inline-start: 1rem; color: var(--muted-foreground, rgb(100 116 139)); margin: 1.25rem 0; font-style: italic; }
        .blog-prose table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; font-size: 0.95rem; }
        .blog-prose th, .blog-prose td { border: 1px solid var(--border, rgb(226 232 240)); padding: 0.6rem 0.85rem; text-align: start; }
        .blog-prose th { background: rgb(248 250 252); font-weight: 600; }
        :where([data-theme="dark"]) .blog-prose th { background: rgb(30 41 59); }
        .blog-prose hr { border: 0; border-top: 1px solid var(--border, rgb(226 232 240)); margin: 2.5rem 0; }
      `}</style>
    </main>
  );
}
