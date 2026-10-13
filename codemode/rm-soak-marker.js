#!/usr/bin/env node
// codemode script: removes the soak marker file and returns the bash result
const { execSync } = require('child_process');

try {
  const result = execSync("bash -c 'rm /tmp/soak/marker.txt'", { encoding: 'utf8' });
  return result;
} catch (err) {
  return { status: err.status, stdout: err.stdout, stderr: err.stderr };
}
