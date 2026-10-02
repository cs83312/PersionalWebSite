import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { SLUG_PATTERN, parseBlogPostFile } from './blogPosts';

// gray-matter bundles js-yaml; wrapping the file as frontmatter reuses it
// instead of adding a separate YAML dependency.
function readCmsConfig(): Record<string, any> {
  const yaml = fs.readFileSync(path.join(process.cwd(), 'public', 'admin', 'config.yml'), 'utf8');
  return matter(`---\n${yaml}\n---\n`).data;
}

function blogCollection(): Record<string, any> {
  const collection = readCmsConfig().collections.find((c: { name: string }) => c.name === 'blog');
  assert.ok(collection, 'config.yml must define a "blog" collection');
  return collection;
}

test('CMS blog collection writes into content/blog, the directory the loader reads', () => {
  const collection = blogCollection();
  assert.equal(collection.folder, '/content/blog');
  assert.equal(collection.extension, 'md');
  assert.equal(collection.path, undefined, 'a path template would create subfolders, which the loader ignores');
});

test('CMS slug pattern matches the loader slug rule', () => {
  const [pattern] = blogCollection().slug.pattern;
  assert.equal(pattern, SLUG_PATTERN.source);
});

test('CMS stores images under public/blog/<slug>/ and links them as /blog/<slug>/', () => {
  const collection = blogCollection();
  assert.equal(collection.media_folder, '/public/blog/{{filename}}');
  assert.equal(collection.public_folder, '/blog/{{filename}}');
});

test('CMS frontmatter fields match what parseBlogPostFile expects', () => {
  const fields = blogCollection().fields as { name: string; required?: boolean; type?: string }[];
  const byName = Object.fromEntries(fields.map((field) => [field.name, field]));
  assert.deepEqual(Object.keys(byName).sort(), ['body', 'date', 'summary', 'title']);
  assert.equal(byName.date.type, 'date', 'date must be date-only so it serialises as YYYY-MM-DD');
  assert.equal(byName.summary.required, false);
});

test('a post saved by the CMS with an empty summary and an uploaded image parses', () => {
  const raw = [
    '---',
    'title: 後台建立的文章',
    'date: 2026-09-27',
    "summary: ''",
    '---',
    '',
    '![圖片](/blog/from-cms/photo.webp)',
    '',
  ].join('\n');
  const post = parseBlogPostFile('from-cms.md', raw);
  assert.equal(post.date, '2026-09-27');
  assert.equal(post.summary, '');
  assert.equal(post.content, '![圖片](/blog/from-cms/photo.webp)');
});
