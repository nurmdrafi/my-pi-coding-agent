import { test } from 'node:test';
import assert from 'node:assert/strict';

import { greet } from '../src/greet.js';
import { run } from '../src/cli-core.js';

test('greet formats the plain greeting (existing behavior)', () => {
  assert.equal(greet('ada'), 'Hello, ada.');
});

test('run without a name prints usage and exits 1 (existing behavior)', () => {
  assert.deepEqual(run([]), { text: 'usage: cli [--upper] <name>', exit: 1 });
});

test('run greets the named person (existing behavior)', () => {
  assert.deepEqual(run(['ada']), { text: 'Hello, ada.', exit: 0 });
});

test('run --upper uppercases the greeting (new behavior)', () => {
  assert.deepEqual(run(['--upper', 'ada']), { text: 'HELLO, ADA.', exit: 0 });
  assert.deepEqual(run(['ada', '--upper']), { text: 'HELLO, ADA.', exit: 0 });
});
