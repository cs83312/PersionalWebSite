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
  // Root-relative (e.g. /blog/<slug>/cover.png) without basePath; '' when unset.
  cover: string;
  content: string;
}
