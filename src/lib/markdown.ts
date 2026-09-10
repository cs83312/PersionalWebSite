import { Marked, type Token } from 'marked';

// Markdown authors write root-relative paths like /blog/<slug>/cover.png.
// On GitHub Pages the site lives under a basePath, so those hrefs need the
// prefix. External URLs and anchors must stay untouched.
function prefixInternalHrefs(basePath: string) {
  return (token: Token): void => {
    if (token.type !== 'image' && token.type !== 'link') {
      return;
    }
    if (!token.href.startsWith('/')) {
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
