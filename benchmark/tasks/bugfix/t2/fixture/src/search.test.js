import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contains, endsWith } from '../src/search.js';

test('contains finds a match at position 0', () => {
  assert.equal(contains('pi.md', 'pi'), true);
});

test('contains still finds later matches and rejects misses', () => {
  assert.equal(contains('docs/pi.md', 'pi'), true);
  assert.equal(contains('pod', 'pi'), false);
});

test('endsWith accepts s equal to suffix', () => {
  assert.equal(endsWith('.md', '.md'), true);
  assert.equal(endsWith('report.md', '.md'), true);
  assert.equal(endsWith('report.txt', '.md'), false);
});
