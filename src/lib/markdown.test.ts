import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown';

test('renderMarkdown converts heading, bold, list, and link', () => {
  const html = renderMarkdown('# Title\n\n**bold** text\n\n- item one\n- item two\n\n[link](https://example.com)');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<li>item one<\/li>/);
  assert.match(html, /<a href="https:\/\/example.com">link<\/a>/);
});
