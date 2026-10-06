import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EMPTY_PROJECTS_PLACEHOLDER, getAllProjects, getProjectBySlug, projectStaticParams } from '@/lib/projects';
import { renderMarkdown, withBasePath } from '@/lib/markdown';
import { basePath } from '@/lib/basePath';
import articleStyles from '@/app/article.module.css';
import styles from './page.module.css';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const project = await getProjectBySlug(params.slug);

  if (!project) {
    return {};
  }

  return {
    title: `${project.title} | KFxNet`,
    description: project.summary || project.title,
  };
}

export async function generateStaticParams() {
  return projectStaticParams(await getAllProjects());
}

export default async function ProjectDetailPage({ params }: { params: { slug: string } }) {
  const project = await getProjectBySlug(params.slug);

  if (!project && params.slug === EMPTY_PROJECTS_PLACEHOLDER) {
    notFound();
  }

  if (!project) {
    throw new Error(`Project not found for slug: ${params.slug} (generateStaticParams/getProjectBySlug mismatch)`);
  }

  const html = renderMarkdown(project.content, basePath);

  return (
    <article className={styles.article}>
      <h1>{project.title}</h1>
      {project.techStack && <p className={styles.techStack}>{project.techStack}</p>}
      {project.cover && (
        <img src={withBasePath(project.cover, basePath)} alt={project.title} className={styles.image} />
      )}
      {html && <div className={articleStyles.content} dangerouslySetInnerHTML={{ __html: html }} />}
      {project.linkUrl && (
        <a href={project.linkUrl} target="_blank" rel="noreferrer" className={styles.link}>
          查看專案 →
        </a>
      )}
    </article>
  );
}
