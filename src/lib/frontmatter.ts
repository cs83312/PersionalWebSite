import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

// Shared rules for content files (content/blog, content/projects): the
// filename is the URL slug, frontmatter is YAML, and anything malformed
// throws so the build fails instead of silently dropping the file.
export const SLUG_PATTERN = /^[a-z0-9-]+$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// YAML parses an unquoted 2026-09-07 into a Date at UTC midnight, while a
// quoted "2026-09-07" stays a string. Normalise both back to YYYY-MM-DD.
// A Date carrying a time-of-day or UTC offset (e.g. "2026-01-01 08:00:00
// +09:00") is NOT a genuine date-only value: converting it to UTC can shift
// the calendar day, silently corrupting the sort key. Only a Date whose UTC
// time components are all zero is trusted; anything else is handed back as
// its full ISO string so it falls through to DATE_PATTERN and fails loudly.
export function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    const isDateOnly =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;
    return isDateOnly ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  return typeof value === 'string' ? value.trim() : '';
}

export interface ParsedMarkdownFile {
  slug: string;
  data: Record<string, any>;
  content: string;
}

// `kind` names the collection in error messages, e.g. 'Blog post' or 'Project'.
export function parseMarkdownFile(kind: string, fileName: string, raw: string): ParsedMarkdownFile {
  const slug = fileName.replace(/\.md$/, '');
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `Invalid ${kind.toLowerCase()} filename "${fileName}": the slug must be lowercase letters, digits and hyphens only`,
    );
  }

  try {
    const parsed = matter(raw);
    return { slug, data: parsed.data, content: parsed.content.trim() };
  } catch (error) {
    throw new Error(`${kind} "${fileName}" has invalid YAML frontmatter: ${(error as Error).message}`);
  }
}

function assertStringOrAbsent(value: unknown, field: string, owner: string): void {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new Error(`${owner} has an invalid frontmatter "${field}": expected a string, got ${typeof value}`);
  }
}

export function readRequiredString(data: Record<string, any>, field: string, owner: string): string {
  const value = data[field];
  assertStringOrAbsent(value, field, owner);
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new Error(`${owner} is missing the required frontmatter field "${field}"`);
  }
  return text;
}

export function readOptionalString(data: Record<string, any>, field: string, owner: string): string {
  const value = data[field];
  assertStringOrAbsent(value, field, owner);
  return typeof value === 'string' ? value.trim() : '';
}

export function readDate(data: Record<string, any>, owner: string): string {
  const date = normalizeDate(data.date);
  if (!DATE_PATTERN.test(date)) {
    throw new Error(`${owner} has an invalid frontmatter "date": expected YYYY-MM-DD, got "${date || '(missing)'}"`);
  }
  return date;
}

export function sortByDateThenSlug<T extends { date: string; slug: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    if (a.slug === b.slug) {
      return 0;
    }
    return a.slug < b.slug ? -1 : 1;
  });
}

// Only first-level files are read. The extension match is case-insensitive
// so an UPPER.MD file is picked up and then rejected by the slug rule,
// rather than silently ignored.
export function readMarkdownDir<T>(dir: string, parse: (fileName: string, raw: string) => T): T[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((fileName) => /\.md$/i.test(fileName))
    .map((fileName) => parse(fileName, fs.readFileSync(path.join(dir, fileName), 'utf8')));
}
