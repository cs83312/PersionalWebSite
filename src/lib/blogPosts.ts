import { fetchCsvRows } from './sheets';
import type { BlogPost } from './types';

const BLOG_POSTS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1Vk-e665IwaW2pf3Nng6lA7oqdcPsPFxc4JWhi0ZRRX4/gviz/tq?tqx=out:csv&sheet=Blog%20Posts';

export function parseBlogPostRows(rows: Record<string, string>[]): BlogPost[] {
  const posts: BlogPost[] = [];

  rows.forEach((row, index) => {
    if (!row.slug || !row.title) {
      console.warn(`Skipping blog post row ${index + 2}: missing required "slug" or "title"`);
      return;
    }

    posts.push({
      slug: row.slug,
      title: row.title,
      date: row.date ?? '',
      summary: row.summary ?? '',
      content: row.content ?? '',
      order: row.order && !Number.isNaN(Number(row.order)) ? Number(row.order) : index,
    });
  });

  return posts.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    return a.order - b.order;
  });
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  const rows = await fetchCsvRows(BLOG_POSTS_CSV_URL);
  return parseBlogPostRows(rows);
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const posts = await getAllBlogPosts();
  return posts.find((post) => post.slug === slug);
}
