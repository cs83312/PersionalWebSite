import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { BlogPost } from './types';

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// YAML parses an unquoted 2026-09-07 into a Date at UTC midnight, while a
// quoted "2026-09-07" stays a string. Normalise both back to YYYY-MM-DD.
// A Date carrying a time-of-day or UTC offset (e.g. "2026-01-01 08:00:00
// +09:00") is NOT a genuine date-only value: converting it to UTC can shift
// the calendar day, silently corrupting the sort key. Only a Date whose UTC
// time components are all zero is trusted; anything else is handed back as
// its full ISO string so it falls through to DATE_PATTERN and fails loudly.
function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    const isDateOnly =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;
    return isDateOnly ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  return typeof value === 'string' ? value.trim() : '';
}

export function parseBlogPostFile(fileName: string, raw: string): BlogPost {
  const slug = fileName.replace(/\.md$/, '');
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `Invalid blog post filename "${fileName}": the slug must be lowercase letters, digits and hyphens only`,
    );
  }

  let data: Record<string, any>;
  let content: string;
  try {
    const parsed = matter(raw);
    data = parsed.data;
    content = parsed.content;
  } catch (error) {
    throw new Error(`Blog post "${fileName}" has invalid YAML frontmatter: ${(error as Error).message}`);
  }

  const rawTitle = data.title;
  if (rawTitle !== undefined && rawTitle !== null && typeof rawTitle !== 'string') {
    throw new Error(
      `Blog post "${fileName}" has an invalid frontmatter "title": expected a string, got ${typeof rawTitle}`,
    );
  }
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  if (!title) {
    throw new Error(`Blog post "${fileName}" is missing the required frontmatter field "title"`);
  }

  const date = normalizeDate(data.date);
  if (!DATE_PATTERN.test(date)) {
    throw new Error(
      `Blog post "${fileName}" has an invalid frontmatter "date": expected YYYY-MM-DD, got "${date || '(missing)'}"`,
    );
  }

  const rawSummary = data.summary;
  if (rawSummary !== undefined && rawSummary !== null && typeof rawSummary !== 'string') {
    throw new Error(
      `Blog post "${fileName}" has an invalid frontmatter "summary": expected a string, got ${typeof rawSummary}`,
    );
  }
  const summary = typeof rawSummary === 'string' ? rawSummary.trim() : '';

  return { slug, title, date, summary, content: content.trim() };
}

export function sortBlogPosts(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    if (a.slug === b.slug) {
      return 0;
    }
    return a.slug < b.slug ? -1 : 1;
  });
}

export function readBlogPostsFromDir(dir: string): BlogPost[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const posts = fs
    .readdirSync(dir)
    .filter((fileName) => /\.md$/i.test(fileName))
    .map((fileName) => parseBlogPostFile(fileName, fs.readFileSync(path.join(dir, fileName), 'utf8')));

  return sortBlogPosts(posts);
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  return readBlogPostsFromDir(BLOG_DIR);
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const posts = await getAllBlogPosts();
  return posts.find((post) => post.slug === slug);
}
