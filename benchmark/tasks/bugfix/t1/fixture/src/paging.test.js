import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pageCount, firstIndex } from '../src/paging.js';

test('pageCount rounds up to cover a trailing partial page', () => {
  assert.equal(pageCount(10, 3), 4);
  assert.equal(pageCount(9, 3), 3);
});

test('pageCount of zero items is zero', () => {
  assert.equal(pageCount(0, 10), 0);
});

test('firstIndex is 0-based for page and item', () => {
  assert.equal(firstIndex(0, 10), 0);
  assert.equal(firstIndex(2, 10), 20);
});
