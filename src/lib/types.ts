export interface Project {
  slug: string;
  title: string;
  date: string;
  summary: string;
  techStack: string;
  // Root-relative (e.g. /project/<slug>/cover.webp) without basePath; '' when unset.
  cover: string;
  linkUrl: string;
  // Raw Markdown body.
  content: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  summary: string;
  content: string;
}
