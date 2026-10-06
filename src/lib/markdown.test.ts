import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, withBasePath } from './markdown';

test('renderMarkdown converts heading, bold, list, and link', () => {
  const html = renderMarkdown('# Title\n\n**bold** text\n\n- item one\n- item two\n\n[link](https://example.com)');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<li>item one<\/li>/);
  assert.match(html, /<a href="https:\/\/example.com">link<\/a>/);
});

test('renderMarkdown prefixes root-relative image and link paths with basePath', () => {
  const html = renderMarkdown('![封面](/blog/blog-test/cover.png)\n\n[內頁](/blog/other)', '/PersionalWebSite');
  assert.match(html, /<img src="\/PersionalWebSite\/blog\/blog-test\/cover\.png"/);
  assert.match(html, /<a href="\/PersionalWebSite\/blog\/other">內頁<\/a>/);
});

test('renderMarkdown leaves external links and anchors untouched', () => {
  const html = renderMarkdown('[外連](https://example.com) [錨點](#section)', '/PersionalWebSite');
  assert.match(html, /<a href="https:\/\/example\.com">外連<\/a>/);
  assert.match(html, /<a href="#section">錨點<\/a>/);
});

test('renderMarkdown leaves paths unchanged when basePath is empty', () => {
  const html = renderMarkdown('![封面](/blog/blog-test/cover.png)\n\n[內頁](/blog/other)');
  assert.match(html, /<img src="\/blog\/blog-test\/cover\.png"/);
  assert.match(html, /<a href="\/blog\/other">內頁<\/a>/);
});

test('renderMarkdown does not double-prefix an href that already starts with basePath', () => {
  const html = renderMarkdown('![c](/PersionalWebSite/blog/a/c.png)', '/PersionalWebSite');
  assert.match(html, /<img src="\/PersionalWebSite\/blog\/a\/c\.png"/);
  assert.doesNotMatch(html, /PersionalWebSite\/PersionalWebSite/);
});

test('renderMarkdown leaves protocol-relative URLs untouched', () => {
  const html = renderMarkdown('![cdn](//cdn.example.com/x.png) [cdn](//cdn.example.com/page)', '/PersionalWebSite');
  assert.match(html, /<img src="\/\/cdn\.example\.com\/x\.png"/);
  assert.match(html, /<a href="\/\/cdn\.example\.com\/page">cdn<\/a>/);
});

test('withBasePath prefixes a root-relative path', () => {
  assert.equal(withBasePath('/project/a/cover.webp', '/PersionalWebSite'), '/PersionalWebSite/project/a/cover.webp');
});

test('withBasePath leaves external and protocol-relative URLs untouched', () => {
  assert.equal(withBasePath('https://example.com/a.png', '/PersionalWebSite'), 'https://example.com/a.png');
  assert.equal(withBasePath('//cdn.example.com/a.png', '/PersionalWebSite'), '//cdn.example.com/a.png');
  assert.equal(withBasePath('relative/a.png', '/PersionalWebSite'), 'relative/a.png');
});

test('withBasePath leaves a path that already carries basePath untouched', () => {
  assert.equal(
    withBasePath('/PersionalWebSite/project/a/cover.webp', '/PersionalWebSite'),
    '/PersionalWebSite/project/a/cover.webp',
  );
});

test('withBasePath returns the path unchanged when basePath is empty', () => {
  assert.equal(withBasePath('/project/a/cover.webp', ''), '/project/a/cover.webp');
});
