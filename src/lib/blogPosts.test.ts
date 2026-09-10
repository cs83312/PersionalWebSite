import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseBlogPostFile, readBlogPostsFromDir, sortBlogPosts } from './blogPosts';
import type { BlogPost } from './types';

const VALID = [
  '---',
  'title: 測試標題',
  'date: 2026-09-07',
  'summary: 一句話摘要',
  '---',
  '',
  '內文第一段。',
  '',
].join('\n');

test('parseBlogPostFile reads frontmatter and takes the slug from the filename', () => {
  const post = parseBlogPostFile('blog-test.md', VALID);
  assert.equal(post.slug, 'blog-test');
  assert.equal(post.title, '測試標題');
  assert.equal(post.date, '2026-09-07');
  assert.equal(post.summary, '一句話摘要');
  assert.equal(post.content, '內文第一段。');
});

test('parseBlogPostFile normalises an unquoted YAML date to YYYY-MM-DD', () => {
  // js-yaml parses an unquoted 2026-09-07 into a Date object, not a string.
  const post = parseBlogPostFile('blog-test.md', VALID);
  assert.equal(typeof post.date, 'string');
  assert.equal(post.date, '2026-09-07');
});

test('parseBlogPostFile accepts a quoted date string too', () => {
  const raw = ['---', 'title: 測試標題', 'date: "2026-09-07"', '---', '', '內文。', ''].join('\n');
  assert.equal(parseBlogPostFile('blog-test.md', raw).date, '2026-09-07');
});

test('parseBlogPostFile defaults a missing summary to an empty string', () => {
  const raw = ['---', 'title: 測試標題', 'date: 2026-09-07', '---', '', '內文。', ''].join('\n');
  assert.equal(parseBlogPostFile('blog-test.md', raw).summary, '');
});

test('parseBlogPostFile throws when title is missing', () => {
  const raw = ['---', 'date: 2026-09-07', '---', '', '內文。', ''].join('\n');
  assert.throws(() => parseBlogPostFile('blog-test.md', raw), /blog-test\.md[\s\S]*title/);
});

test('parseBlogPostFile throws when date is missing', () => {
  const raw = ['---', 'title: 測試標題', '---', '', '內文。', ''].join('\n');
  assert.throws(() => parseBlogPostFile('blog-test.md', raw), /blog-test\.md[\s\S]*date/);
});

test('parseBlogPostFile throws when date is not YYYY-MM-DD', () => {
  const raw = ['---', 'title: 測試標題', 'date: "2026/09/07"', '---', '', '內文。', ''].join('\n');
  assert.throws(() => parseBlogPostFile('blog-test.md', raw), /blog-test\.md[\s\S]*date/);
});

test('parseBlogPostFile throws when the filename is not a valid slug', () => {
  assert.throws(() => parseBlogPostFile('測試文章.md', VALID), /測試文章\.md/);
  assert.throws(() => parseBlogPostFile('My_Post.md', VALID), /My_Post\.md/);
});

function post(slug: string, date: string): BlogPost {
  return { slug, title: slug, date, summary: '', content: '' };
}

test('sortBlogPosts orders newest date first', () => {
  const sorted = sortBlogPosts([post('old', '2026-01-01'), post('new', '2026-06-01')]);
  assert.deepEqual(sorted.map((p) => p.slug), ['new', 'old']);
});

test('sortBlogPosts breaks same-date ties by slug ascending', () => {
  const sorted = sortBlogPosts([post('bravo', '2026-01-01'), post('alpha', '2026-01-01')]);
  assert.deepEqual(sorted.map((p) => p.slug), ['alpha', 'bravo']);
});

test('sortBlogPosts does not mutate its input', () => {
  const input = [post('old', '2026-01-01'), post('new', '2026-06-01')];
  sortBlogPosts(input);
  assert.deepEqual(input.map((p) => p.slug), ['old', 'new']);
});

test('readBlogPostsFromDir returns an empty array when the directory does not exist', () => {
  const missing = path.join(os.tmpdir(), 'blog-posts-does-not-exist-12345');
  assert.deepEqual(readBlogPostsFromDir(missing), []);
});

test('readBlogPostsFromDir returns an empty array when the directory holds no markdown', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-empty-'));
  try {
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a post');
    assert.deepEqual(readBlogPostsFromDir(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readBlogPostsFromDir reads markdown files and returns them sorted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-posts-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'older.md'),
      ['---', 'title: 舊文', 'date: 2026-01-01', '---', '', '舊內文。', ''].join('\n'),
    );
    fs.writeFileSync(
      path.join(dir, 'newer.md'),
      ['---', 'title: 新文', 'date: 2026-06-01', '---', '', '新內文。', ''].join('\n'),
    );
    assert.deepEqual(readBlogPostsFromDir(dir).map((p) => p.slug), ['newer', 'older']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readBlogPostsFromDir propagates a parse error so the build fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-bad-'));
  try {
    fs.writeFileSync(path.join(dir, 'broken.md'), ['---', 'date: 2026-01-01', '---', '', '沒有標題。', ''].join('\n'));
    assert.throws(() => readBlogPostsFromDir(dir), /broken\.md[\s\S]*title/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
