import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Static + dynamic sitemap for the marketing surface.
 *
 * Blog posts and industry verticals may be authored by parallel agents; we
 * try to enumerate them at build time, but fall back gracefully if the
 * supporting modules don't exist yet so the build never fails.
 */

const VERTICAL_SLUGS = [
  "restaurant",
  "retail",
  "pharmacy",
  "kindergarten",
  "homecare",
  "events",
  "garage",
  "clinic",
  "security",
] as const;

const FALLBACK_BLOG_SLUGS: string[] = [
  "how-to-build-a-work-schedule",
  "whatsapp-for-team-scheduling",
  "fair-shift-distribution",
  "shift-swap-without-headaches",
  "labor-law-israel-overview",
  "minimum-rest-between-shifts",
  "scheduling-for-restaurants",
  "scheduling-for-retail",
  "scheduling-for-pharmacies",
  "automated-vs-manual-scheduling",
];

async function safeBlogSlugs(): Promise<string[]> {
  try {
    // Dynamic import — succeeds only if the blog agent has shipped lib/blog.ts.
    const mod = (await import("@/lib/blog").catch(() => null)) as
      | { getAllPosts?: () => Array<{ slug: string }> | Promise<Array<{ slug: string }>> }
      | null;
    if (!mod?.getAllPosts) return FALLBACK_BLOG_SLUGS;
    const posts = await mod.getAllPosts();
    if (!Array.isArray(posts) || posts.length === 0) return FALLBACK_BLOG_SLUGS;
    return posts.map((p) => p.slug);
  } catch {
    return FALLBACK_BLOG_SLUGS;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const blogSlugs = await safeBlogSlugs();

  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/features`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/industries`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];

  for (const slug of VERTICAL_SLUGS) {
    entries.push({
      url: `${SITE_URL}/industries/${slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  entries.push({
    url: `${SITE_URL}/blog`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  });

  for (const slug of blogSlugs) {
    entries.push({
      url: `${SITE_URL}/blog/${slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }

  entries.push({
    url: `${SITE_URL}/login`,
    lastModified: now,
    changeFrequency: "yearly",
    priority: 0.3,
  });

  return entries;
}
