import { Marked, type Token } from 'marked';

// Markdown authors write root-relative paths like /blog/<slug>/cover.png.
// On GitHub Pages the site lives under a basePath, so those hrefs need the
// prefix. External URLs (including protocol-relative //cdn.example.com),
// anchors, and relative paths must stay untouched. An href that already
// starts with the basePath (e.g. copied from the live site) must also be
// left alone, or it ends up prefixed twice.
function prefixInternalHrefs(basePath: string) {
  return (token: Token): void => {
    if (token.type !== 'image' && token.type !== 'link') {
      return;
    }
    if (!token.href.startsWith('/') || token.href.startsWith('//')) {
      return;
    }
    if (basePath && token.href.startsWith(`${basePath}/`)) {
      return;
    }
    token.href = `${basePath}${token.href}`;
  };
}

export function renderMarkdown(content: string, basePath = ''): string {
  const marked = new Marked({
    async: false,
    walkTokens: prefixInternalHrefs(basePath),
  });
  return marked.parse(content) as string;
}
