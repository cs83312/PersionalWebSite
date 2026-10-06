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
import type { Project } from './types';

export { SLUG_PATTERN };

const PROJECTS_DIR = path.join(process.cwd(), 'content', 'projects');

// Static export rejects a dynamic route whose generateStaticParams is empty,
// so with no projects the detail route gets one placeholder page that renders
// a 404. The underscore keeps it from ever matching a real slug.
export const EMPTY_PROJECTS_PLACEHOLDER = '_empty';

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

export function projectStaticParams(projects: Project[]): { slug: string }[] {
  if (projects.length === 0) {
    return [{ slug: EMPTY_PROJECTS_PLACEHOLDER }];
  }
  return projects.map((project) => ({ slug: project.slug }));
}

export async function getAllProjects(): Promise<Project[]> {
  return readProjectsFromDir(PROJECTS_DIR);
}

export async function getProjectBySlug(slug: string): Promise<Project | undefined> {
  const projects = await getAllProjects();
  return projects.find((project) => project.slug === slug);
}
