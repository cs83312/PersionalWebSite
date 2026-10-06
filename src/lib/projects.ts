import path from 'node:path';
import {
  parseMarkdownFile,
  readDate,
  readMarkdownDir,
  readOptionalString,
  readRequiredString,
  sortByDateThenSlug,
} from './frontmatter';
import type { Project } from './types';

const PROJECTS_DIR = path.join(process.cwd(), 'content', 'projects');

export function parseProjectFile(fileName: string, raw: string): Project {
  const { slug, data, content } = parseMarkdownFile('Project', fileName, raw);
  const owner = `Project "${fileName}"`;

  return {
    slug,
    title: readRequiredString(data, 'title', owner),
    date: readDate(data, owner),
    summary: readOptionalString(data, 'summary', owner),
    techStack: readOptionalString(data, 'tech_stack', owner),
    cover: readOptionalString(data, 'cover', owner),
    linkUrl: readOptionalString(data, 'link_url', owner),
    content,
  };
}

export function readProjectsFromDir(dir: string): Project[] {
  return sortByDateThenSlug(readMarkdownDir(dir, parseProjectFile));
}

export async function getAllProjects(): Promise<Project[]> {
  return readProjectsFromDir(PROJECTS_DIR);
}

export async function getProjectBySlug(slug: string): Promise<Project | undefined> {
  const projects = await getAllProjects();
  return projects.find((project) => project.slug === slug);
}
