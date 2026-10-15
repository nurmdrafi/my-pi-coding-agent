import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slugify } from '../src/slug.js';

test('slugify lowercases and hyphenates (new behavior)', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('slugify collapses runs and trims hyphens (new behavior)', () => {
  assert.equal(slugify('  Multiple   Spaces! '), 'multiple-spaces');
  assert.equal(slugify('Hot & Cold (v2)'), 'hot-cold-v2');
  assert.equal(slugify('---edges---'), 'edges');
});
