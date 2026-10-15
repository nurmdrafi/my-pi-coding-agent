#!/usr/bin/env node
import { run } from './cli-core.js';
const r = run(process.argv.slice(2));
console.log(r.text);
process.exit(r.exit);
