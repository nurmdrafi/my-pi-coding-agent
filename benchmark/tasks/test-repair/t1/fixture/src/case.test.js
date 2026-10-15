import { test } from 'node:test';
import assert from 'node:assert/strict';

import { camel, kebab } from '../src/case.js';

test('camel joins segments and keeps the first lowercase', () => {
  assert.equal(camel('hello-world'), 'HelloWorld');
  assert.equal(camel('a-b-c'), 'aBC');
});

test('kebab hyphenates capital letters', () => {
  assert.equal(camel('myToolName'), 'my-tool-name');
});
