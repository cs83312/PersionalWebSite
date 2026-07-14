import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvRows } from './sheets';

test('parseCsvRows trims header and value whitespace', () => {
  const csv = 'slug ,title\n hui-hui , 恢恢巡路系統 \n';
  const rows = parseCsvRows(csv);
  assert.deepEqual(rows, [{ slug: 'hui-hui', title: '恢恢巡路系統' }]);
});

test('parseCsvRows preserves multi-line quoted fields', () => {
  const csv = 'slug,description\nhui-hui,"line one\nline two"\n';
  const rows = parseCsvRows(csv);
  assert.equal(rows[0].description, 'line one\nline two');
});

test('parseCsvRows skips empty lines', () => {
  const csv = 'slug,title\nhui-hui,Test\n\n';
  const rows = parseCsvRows(csv);
  assert.equal(rows.length, 1);
});
