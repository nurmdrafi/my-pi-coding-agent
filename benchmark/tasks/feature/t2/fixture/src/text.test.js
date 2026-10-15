import { test } from 'node:test';
import assert from 'node:assert/strict';

import { wordCount } from '../src/text.js';

test('wordCount counts words (existing behavior)', () => {
  assert.equal(wordCount('a b c'), 3);
  assert.equal(wordCount('  spaced   out  '), 2);
  assert.equal(wordCount(''), 0);
});
