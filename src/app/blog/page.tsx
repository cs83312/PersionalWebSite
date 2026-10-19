import { getAllBlogPosts } from '@/lib/blogPosts';
import { withBasePath } from '@/lib/markdown';
import { basePath } from '@/lib/basePath';
import { Card } from '@/components/Card';
import styles from './page.module.css';

export default async function BlogPage() {
  const posts = await getAllBlogPosts();

  return (
    <section>
      <h1 className={styles.title}>Blog</h1>
      <div className={styles.grid}>
        {posts.map((post) => (
          <Card
            key={post.slug}
            href={`/blog/${post.slug}`}
            title={post.title}
            description={post.summary}
            meta={post.date}
            imageSrc={post.cover ? withBasePath(post.cover, basePath) : undefined}
          />
        ))}
      </div>
    </section>
  );
}
