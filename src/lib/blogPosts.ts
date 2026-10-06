import path from 'node:path';
import {
  SLUG_PATTERN,
  parseMarkdownFile,
  readDate,
  readMarkdownDir,
  readOptionalString,
  readRequiredString,
  sortByDateThenSlug,
} from './frontmatter';
import type { BlogPost } from './types';

// Re-exported so existing imports (cmsConfig.test.ts) keep working.
export { SLUG_PATTERN };

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

export function parseBlogPostFile(fileName: string, raw: string): BlogPost {
  const { slug, data, content } = parseMarkdownFile('Blog post', fileName, raw);
  const owner = `Blog post "${fileName}"`;

  return {
    slug,
    title: readRequiredString(data, 'title', owner),
    date: readDate(data, owner),
    summary: readOptionalString(data, 'summary', owner),
    content,
  };
}

export function sortBlogPosts(posts: BlogPost[]): BlogPost[] {
  return sortByDateThenSlug(posts);
}

export function readBlogPostsFromDir(dir: string): BlogPost[] {
  return sortBlogPosts(readMarkdownDir(dir, parseBlogPostFile));
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  return readBlogPostsFromDir(BLOG_DIR);
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const posts = await getAllBlogPosts();
  return posts.find((post) => post.slug === slug);
}
