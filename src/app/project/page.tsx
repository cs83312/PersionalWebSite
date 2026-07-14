import { getAllProjects } from '@/lib/projects';
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
          />
        ))}
      </div>
    </section>
  );
}
