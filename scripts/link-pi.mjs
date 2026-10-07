#!/usr/bin/env node
/**
 * Ensure the repo's gitignored node_modules can resolve the host pi packages
 * imported by extensions and tests: @earendil-works/pi-coding-agent (the
 * global install that runs this repo's extensions) and @earendil-works/pi-tui
 * (nested inside it). An existing link is validated by resolving its
 * package.json — a stale empty directory must not pass (that state silently
 * broke resolution before). No absolute paths: the global root comes from
 * `npm root -g`.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();

const LINKS = [
	['@earendil-works/pi-coding-agent', join(globalRoot, '@earendil-works', 'pi-coding-agent')],
	[
		'@earendil-works/pi-tui',
		join(globalRoot, '@earendil-works', 'pi-coding-agent', 'node_modules', '@earendil-works', 'pi-tui'),
	],
];

for (const [name, target] of LINKS) {
	const link = join(ROOT, 'node_modules', ...name.split('/'));
	if (existsSync(join(link, 'package.json'))) continue;
	if (!existsSync(target)) {
		console.error(`link-pi: global package not found: ${target}`);
		process.exit(1);
	}
	rmSync(link, { recursive: true, force: true });
	mkdirSync(dirname(link), { recursive: true });
	symlinkSync(target, link, 'dir');
	console.log(`link-pi: ${name} -> ${target}`);
}
