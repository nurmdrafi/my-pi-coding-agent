import { test } from 'node:test';
import assert from 'node:assert/strict';

import { withVat, withSalesTax } from '../src/prices.js';

test('withVat adds 20% and rounds to cents', () => {
  assert.equal(withVat(10), 12);
  assert.equal(withVat(0.42), 0.5); // 0.504 → 0.5
  assert.equal(withVat(0), 0);
});

test('withSalesTax adds 8% and rounds to cents', () => {
  assert.equal(withSalesTax(25), 27);
  assert.equal(withSalesTax(0.5), 0.54);
});
