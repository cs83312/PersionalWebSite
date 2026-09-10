import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPO_BASE_PATH, resolveBasePath } from './basePath';

test('REPO_BASE_PATH is the GitHub Pages repo path', () => {
  assert.equal(REPO_BASE_PATH, '/PersionalWebSite');
});

test('resolveBasePath returns the repo base path in production', () => {
  assert.equal(resolveBasePath('production'), '/PersionalWebSite');
});

test('resolveBasePath returns an empty string outside production', () => {
  assert.equal(resolveBasePath('development'), '');
  assert.equal(resolveBasePath('test'), '');
  assert.equal(resolveBasePath(undefined), '');
});
