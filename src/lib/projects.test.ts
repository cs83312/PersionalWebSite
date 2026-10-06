import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EMPTY_PROJECTS_PLACEHOLDER, SLUG_PATTERN, parseProjectFile, projectStaticParams, readProjectsFromDir } from './projects';

const VALID = [
  '---',
  'title: 恢恢巡路系統',
  'date: 2026-10-06',
  'summary: 道路巡護',
  'tech_stack: Next.js · Spring Boot',
  'cover: /project/hui-hui/cover.webp',
  'link_url: https://example.com/app',
  '---',
  '',
  '## 功能',
  '',
  '拍照、定位',
  '',
].join('\n');

function project(frontmatter: string[], body = '內文'): string {
  return ['---', ...frontmatter, '---', '', body, ''].join('\n');
}

function withTempDir(files: Record<string, string>, fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content);
    }
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('parseProjectFile reads every frontmatter field and the Markdown body', () => {
  assert.deepEqual(parseProjectFile('hui-hui.md', VALID), {
    slug: 'hui-hui',
    title: '恢恢巡路系統',
    date: '2026-10-06',
    summary: '道路巡護',
    techStack: 'Next.js · Spring Boot',
    cover: '/project/hui-hui/cover.webp',
    linkUrl: 'https://example.com/app',
    content: '## 功能\n\n拍照、定位',
  });
});

test('parseProjectFile defaults missing optional fields to empty strings', () => {
  const parsed = parseProjectFile('a.md', project(['title: A', 'date: 2026-01-01']));
  assert.equal(parsed.summary, '');
  assert.equal(parsed.techStack, '');
  assert.equal(parsed.cover, '');
  assert.equal(parsed.linkUrl, '');
});

test('a project saved by the CMS with empty optional fields and no body parses', () => {
  const raw = [
    '---',
    'title: 後台建立的專案',
    'date: 2026-10-06',
    "summary: ''",
    "tech_stack: ''",
    "cover: ''",
    "link_url: ''",
    '---',
    '',
  ].join('\n');
  const parsed = parseProjectFile('from-cms.md', raw);
  assert.equal(parsed.title, '後台建立的專案');
  assert.equal(parsed.cover, '');
  assert.equal(parsed.linkUrl, '');
  assert.equal(parsed.content, '');
});

test('parseProjectFile throws when title is missing', () => {
  assert.throws(() => parseProjectFile('hui-hui.md', project(['date: 2026-01-01'])), /hui-hui\.md[\s\S]*title/);
});

test('parseProjectFile throws a wrong-type (not missing) error when title is not a string', () => {
  const raw = project(['title: 123', 'date: 2026-01-01']);
  assert.throws(() => parseProjectFile('hui-hui.md', raw), /hui-hui\.md[\s\S]*title[\s\S]*expected a string/);
  assert.throws(() => parseProjectFile('hui-hui.md', raw), (error: Error) => !/missing/.test(error.message));
});

test('parseProjectFile throws when date is missing or not YYYY-MM-DD', () => {
  assert.throws(() => parseProjectFile('hui-hui.md', project(['title: A'])), /hui-hui\.md[\s\S]*date/);
  assert.throws(() => parseProjectFile('hui-hui.md', project(['title: A', 'date: 2026/01/01'])), /hui-hui\.md[\s\S]*date/);
});

test('parseProjectFile throws when date carries a time and UTC offset', () => {
  const raw = project(['title: A', 'date: 2026-01-01 08:00:00 +09:00']);
  assert.throws(() => parseProjectFile('hui-hui.md', raw), /hui-hui\.md[\s\S]*date/);
});

test('parseProjectFile throws when an optional field is present but not a string', () => {
  assert.throws(
    () => parseProjectFile('hui-hui.md', project(['title: A', 'date: 2026-01-01', 'tech_stack: 123'])),
    /hui-hui\.md[\s\S]*tech_stack[\s\S]*expected a string/,
  );
  assert.throws(
    () => parseProjectFile('hui-hui.md', project(['title: A', 'date: 2026-01-01', 'link_url: [a, b]'])),
    /hui-hui\.md[\s\S]*link_url[\s\S]*expected a string/,
  );
});

test('parseProjectFile throws when the filename is not a valid slug', () => {
  assert.throws(() => parseProjectFile('恢恢.md', VALID), /恢恢\.md/);
  assert.throws(() => parseProjectFile('Hui_Hui.md', VALID), /Hui_Hui\.md/);
});

test('parseProjectFile throws with the filename when the YAML frontmatter is malformed', () => {
  assert.throws(() => parseProjectFile('hui-hui.md', project(['title: [unclosed', 'date: 2026-01-01'])), /hui-hui\.md/);
});

test('project errors name the project file, not a blog post', () => {
  assert.throws(() => parseProjectFile('hui-hui.md', project(['date: 2026-01-01'])), /^Error: Project "hui-hui\.md"/);
  assert.throws(() => parseProjectFile('Bad.md', VALID), /project filename/);
});

test('readProjectsFromDir sorts newest first and breaks same-date ties by slug', () => {
  withTempDir(
    {
      'old.md': project(['title: Old', 'date: 2025-01-01']),
      'b-new.md': project(['title: B', 'date: 2026-05-01']),
      'a-new.md': project(['title: A', 'date: 2026-05-01']),
      'notes.txt': 'not a project',
    },
    (dir) => {
      assert.deepEqual(
        readProjectsFromDir(dir).map((p) => p.slug),
        ['a-new', 'b-new', 'old'],
      );
    },
  );
});

test('readProjectsFromDir returns an empty list for a missing or empty directory', () => {
  assert.deepEqual(readProjectsFromDir(path.join(os.tmpdir(), 'projects-does-not-exist-xyz')), []);
  withTempDir({}, (dir) => assert.deepEqual(readProjectsFromDir(dir), []));
});

test('readProjectsFromDir fails the build on a bad file instead of skipping it', () => {
  withTempDir({ 'broken.md': project(['date: 2026-01-01']) }, (dir) => {
    assert.throws(() => readProjectsFromDir(dir), /broken\.md[\s\S]*title/);
  });
});

test('readProjectsFromDir fails on an uppercase .MD filename', () => {
  withTempDir({ 'UPPER.MD': VALID }, (dir) => {
    assert.throws(() => readProjectsFromDir(dir), /UPPER\.MD/);
  });
});

test('projectStaticParams lists one entry per project slug', () => {
  const projects = [parseProjectFile('a.md', project(['title: A', 'date: 2026-01-01']))];
  assert.deepEqual(projectStaticParams(projects), [{ slug: 'a' }]);
});

test('projectStaticParams returns a placeholder that no real slug can match when there are no projects', () => {
  // Static export rejects a dynamic route with no params, so deleting the last
  // project in /admin would otherwise break every deploy.
  assert.deepEqual(projectStaticParams([]), [{ slug: EMPTY_PROJECTS_PLACEHOLDER }]);
  assert.equal(SLUG_PATTERN.test(EMPTY_PROJECTS_PLACEHOLDER), false);
});
