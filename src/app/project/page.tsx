import { getAllProjects } from '@/lib/projects';
import { withBasePath } from '@/lib/markdown';
import { basePath } from '@/lib/basePath';
import { Card } from '@/components/Card';
import styles from './page.module.css';

export default async function ProjectPage() {
  const projects = await getAllProjects();

  return (
    <section>
      <h1 className={styles.title}>Project</h1>
      <div className={styles.grid}>
        {projects.map((project) => (
          <Card
            key={project.slug}
            href={`/project/${project.slug}`}
            title={project.title}
            description={project.summary}
            meta={project.techStack}
            imageSrc={project.cover ? withBasePath(project.cover, basePath) : undefined}
          />
        ))}
      </div>
    </section>
  );
}
