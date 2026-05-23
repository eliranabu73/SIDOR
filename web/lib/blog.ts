/**
 * Blog post loader — reads Markdown files from /content/blog at build time.
 *
 * Posts live in repo root `content/blog/*.md` (sibling to /web). Each file has
 * YAML frontmatter:
 *
 *   ---
 *   title: "..."
 *   slug: "..."
 *   description: "..."
 *   publishedAt: "2026-04-12"
 *   tags: ["restaurant", "shifts"]
 *   coverEmoji: "🍽️"
 *   ---
 *
 *   # Body in Markdown...
 *
 * Used by:
 *   - web/app/blog/page.tsx
 *   - web/app/blog/[slug]/page.tsx
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

export interface BlogPostMeta {
  title: string;
  slug: string;
  description: string;
  publishedAt: string; // ISO date
  tags: string[];
  coverEmoji: string;
}

export interface BlogPost extends BlogPostMeta {
  /** Raw Markdown body (without frontmatter). */
  content: string;
  /** Rendered HTML body. */
  html: string;
}

// /web/lib/blog.ts -> ../../content/blog
const BLOG_DIR = path.join(process.cwd(), "..", "content", "blog");

let postsCache: BlogPost[] | null = null;

async function readAll(): Promise<BlogPost[]> {
  if (postsCache) return postsCache;

  let files: string[];
  try {
    files = await fs.readdir(BLOG_DIR);
  } catch {
    return [];
  }

  const md = files.filter((f) => f.endsWith(".md"));
  const posts: BlogPost[] = [];

  for (const file of md) {
    const filePath = path.join(BLOG_DIR, file);
    const raw = await fs.readFile(filePath, "utf8");
    const { data, content } = matter(raw);
    const html = await marked.parse(content, { async: true });

    posts.push({
      title: String(data.title ?? ""),
      slug: String(data.slug ?? file.replace(/\.md$/, "")),
      description: String(data.description ?? ""),
      publishedAt: String(data.publishedAt ?? ""),
      tags: Array.isArray(data.tags) ? (data.tags as string[]).map(String) : [],
      coverEmoji: String(data.coverEmoji ?? "📝"),
      content,
      html,
    });
  }

  posts.sort((a, b) =>
    a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0,
  );

  postsCache = posts;
  return posts;
}

/** All blog posts, newest first. */
export async function getAllPosts(): Promise<BlogPost[]> {
  return readAll();
}

/** Lookup a post by slug. Returns `null` when not found. */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const posts = await readAll();
  return posts.find((p) => p.slug === slug) ?? null;
}

/** Formatted Hebrew date, e.g. "12 באפריל 2026". */
export function formatHebrewDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
