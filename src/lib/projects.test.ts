import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProjectRows } from './projects';

function row(overrides: Partial<Record<string, string>> = {}) {
  return {
    slug: '',
    title: '',
    summary: '',
    description: '',
    tech_stack: '',
    image_url: '',
    link_url: '',
    order: '',
    ...overrides,
  };
}

test('parseProjectRows filters rows missing slug or title', () => {
  const rows = [
    row({ slug: 'a', title: 'A', order: '2' }),
    row({ slug: '', title: 'No slug', order: '1' }),
    row({ slug: 'b', title: '', order: '0' }),
  ];
  const projects = parseProjectRows(rows);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].slug, 'a');
});

test('parseProjectRows sorts by numeric order ascending', () => {
  const rows = [
    row({ slug: 'second', title: 'Second', order: '2' }),
    row({ slug: 'first', title: 'First', order: '1' }),
  ];
  const projects = parseProjectRows(rows);
  assert.deepEqual(projects.map((p) => p.slug), ['first', 'second']);
});

test('parseProjectRows falls back to row index order when order is missing', () => {
  const rows = [row({ slug: 'a', title: 'A' }), row({ slug: 'b', title: 'B' })];
  const projects = parseProjectRows(rows);
  assert.deepEqual(projects.map((p) => p.slug), ['a', 'b']);
});
