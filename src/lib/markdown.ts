import { Marked, type Token } from 'marked';

// Content authors write root-relative paths like /blog/<slug>/cover.png.
// On GitHub Pages the site lives under a basePath, so those paths need the
// prefix. External URLs (including protocol-relative //cdn.example.com),
// anchors, and relative paths must stay untouched. A path that already
// starts with the basePath (e.g. copied from the live site) must also be
// left alone, or it ends up prefixed twice.
export function withBasePath(href: string, basePath: string): string {
  if (!href.startsWith('/') || href.startsWith('//')) {
    return href;
  }
  if (basePath && href.startsWith(`${basePath}/`)) {
    return href;
  }
  return `${basePath}${href}`;
}

function prefixInternalHrefs(basePath: string) {
  return (token: Token): void => {
    if (token.type !== 'image' && token.type !== 'link') {
      return;
    }
    token.href = withBasePath(token.href, basePath);
  };
}

export function renderMarkdown(content: string, basePath = ''): string {
  const marked = new Marked({
    async: false,
    walkTokens: prefixInternalHrefs(basePath),
  });
  return marked.parse(content) as string;
}
