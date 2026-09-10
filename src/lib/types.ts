export interface Project {
  slug: string;
  title: string;
  summary: string;
  description: string;
  techStack: string;
  imageUrl: string;
  linkUrl: string;
  order: number;
}

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  summary: string;
  content: string;
}
