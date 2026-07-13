import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlogPostRows } from './blogPosts';

function row(overrides: Partial<Record<string, string>> = {}) {
  return { slug: '', title: '', date: '', summary: '', content: '', order: '', ...overrides };
}

test('parseBlogPostRows filters rows missing slug or title', () => {
  const rows = [row({ slug: 'a', title: 'A', date: '2026-01-01' }), row({ slug: '', title: 'No slug' })];
  const posts = parseBlogPostRows(rows);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].slug, 'a');
});

test('parseBlogPostRows sorts newest date first', () => {
  const rows = [
    row({ slug: 'old', title: 'Old', date: '2026-01-01' }),
    row({ slug: 'new', title: 'New', date: '2026-06-01' }),
  ];
  const posts = parseBlogPostRows(rows);
  assert.deepEqual(posts.map((p) => p.slug), ['new', 'old']);
});

test('parseBlogPostRows uses order as tiebreaker for same date', () => {
  const rows = [
    row({ slug: 'second', title: 'Second', date: '2026-01-01', order: '2' }),
    row({ slug: 'first', title: 'First', date: '2026-01-01', order: '1' }),
  ];
  const posts = parseBlogPostRows(rows);
  assert.deepEqual(posts.map((p) => p.slug), ['first', 'second']);
});
