import type { Metadata } from 'next';
import { getAllBlogPosts, getBlogPostBySlug } from '@/lib/blogPosts';
import { renderMarkdown, withBasePath } from '@/lib/markdown';
import { basePath } from '@/lib/basePath';
import styles from './page.module.css';
import { ArticleContent } from '@/components/ArticleContent';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getBlogPostBySlug(params.slug);

  if (!post) {
    return {};
  }

  return {
    title: `${post.title} | KFxNet`,
    description: post.summary || post.title,
  };
}

export async function generateStaticParams() {
  const posts = await getAllBlogPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export default async function BlogDetailPage({ params }: { params: { slug: string } }) {
  const post = await getBlogPostBySlug(params.slug);

  if (!post) {
    throw new Error(`Blog post not found for slug: ${params.slug} (generateStaticParams/getBlogPostBySlug mismatch)`);
  }

  const html = renderMarkdown(post.content, basePath);

  return (
    <article className={styles.article}>
      <h1>{post.title}</h1>
      {post.date && <p className={styles.date}>{post.date}</p>}
      {post.cover && (
        <img src={withBasePath(post.cover, basePath)} alt={post.title} className={styles.image} />
      )}
      <ArticleContent html={html} />
    </article>
  );
}
