import { fetchCsvRows } from './sheets';
import type { Project } from './types';

const PROJECTS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1Vk-e665IwaW2pf3Nng6lA7oqdcPsPFxc4JWhi0ZRRX4/gviz/tq?tqx=out:csv&sheet=Projects';

export function parseProjectRows(rows: Record<string, string>[]): Project[] {
  const projects: Project[] = [];

  rows.forEach((row, index) => {
    if (!row.slug || !row.title) {
      console.warn(`Skipping project row ${index + 2}: missing required "slug" or "title"`);
      return;
    }

    projects.push({
      slug: row.slug,
      title: row.title,
      summary: row.summary ?? '',
      description: row.description ?? '',
      techStack: row.tech_stack ?? '',
      imageUrl: row.image_url ?? '',
      linkUrl: row.link_url ?? '',
      order: row.order && !Number.isNaN(Number(row.order)) ? Number(row.order) : index,
    });
  });

  return projects.sort((a, b) => a.order - b.order);
}

export async function getAllProjects(): Promise<Project[]> {
  const rows = await fetchCsvRows(PROJECTS_CSV_URL);
  return parseProjectRows(rows);
}

export async function getProjectBySlug(slug: string): Promise<Project | undefined> {
  const projects = await getAllProjects();
  return projects.find((project) => project.slug === slug);
}
