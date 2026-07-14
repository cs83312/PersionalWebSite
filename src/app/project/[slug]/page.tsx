import { getAllProjects, getProjectBySlug } from '@/lib/projects';
import styles from './page.module.css';

export async function generateStaticParams() {
  const projects = await getAllProjects();
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function ProjectDetailPage({ params }: { params: { slug: string } }) {
  const project = await getProjectBySlug(params.slug);

  if (!project) {
    throw new Error(`Project not found for slug: ${params.slug} (generateStaticParams/getProjectBySlug mismatch)`);
  }

  return (
    <article className={styles.article}>
      <h1>{project.title}</h1>
      {project.techStack && <p className={styles.techStack}>{project.techStack}</p>}
      {project.imageUrl && <img src={project.imageUrl} alt={project.title} className={styles.image} />}
      {project.description.split('\n').map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
      {project.linkUrl && (
        <a href={project.linkUrl} target="_blank" rel="noreferrer" className={styles.link}>
          查看專案 →
        </a>
      )}
    </article>
  );
}
