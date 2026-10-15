import { test } from 'node:test';
import assert from 'node:assert/strict';

import { double, half } from './failing.js';

test('double returns n * 2', () => {
  assert.equal(double(2), 4);
  assert.equal(double(0), 0);
  assert.equal(double(-3), -6);
});

test('half returns n / 2', () => {
  assert.equal(half(4), 2);
});
