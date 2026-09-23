#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const useProfile = process.argv[2] === "--profile";

if (process.argv[2] && process.argv[2] !== "--profile") {
	console.log("Usage: browser-start.js [--profile]");
	console.log("\nOptions:");
	console.log("  --profile  Copy your default Chrome profile (cookies, logins)");
	process.exit(1);
}

const IS_MAC = process.platform === "darwin";
const SCRAPING_DIR = IS_MAC
	? `${process.env.HOME}/Library/Caches/browser-tools`
	: `${process.env.HOME}/.cache/browser-tools`;

// --- Cross-platform Chrome discovery -------------------------------------
// Priority: CHROME_PATH env > platform candidates > PATH lookup.
function findChrome() {
	if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
	const candidates = IS_MAC
		? [
				"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
				"/Applications/Chromium.app/Contents/MacOS/Chromium",
			]
		: [
				"/usr/bin/google-chrome",
				"/usr/bin/google-chrome-stable",
				"/usr/bin/chromium-browser",
				"/usr/bin/chromium",
				"/snap/bin/chromium",
			];
	for (const c of candidates) {
		if (fs.existsSync(c)) return c;
	}
	// Bare-name PATH lookup (covers Nix, homebrew, local installs)
	for (const name of ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium", "chrome"]) {
		try {
			const p = execSync(`command -v ${name}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
			if (p) return p;
		} catch {}
	}
	return null;
}

function defaultProfileDir() {
	return IS_MAC
		? `${process.env.HOME}/Library/Application Support/Google/Chrome`
		: `${process.env.HOME}/.config/google-chrome`;
}

function commandExists(cmd) {
	try {
		execSync(`command -v ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] });
		return true;
	} catch {
		return false;
	}
}

// Check if already running on :9222
try {
	const browser = await puppeteer.connect({
		browserURL: "http://localhost:9222",
		defaultViewport: null,
	});
	await browser.disconnect();
	console.log("✓ Chrome already running on :9222");
	process.exit(0);
} catch {}

// Setup profile directory
execSync(`mkdir -p "${SCRAPING_DIR}"`, { stdio: "ignore" });

// Remove SingletonLock to allow new instance
try {
	execSync(`rm -f "${SCRAPING_DIR}/SingletonLock" "${SCRAPING_DIR}/SingletonSocket" "${SCRAPING_DIR}/SingletonCookie"`, { stdio: "ignore" });
} catch {}

if (useProfile) {
	const src = defaultProfileDir();
	if (!fs.existsSync(src)) {
		console.log(`⚠ No Chrome profile found at ${src} — starting fresh`);
	} else {
		console.log("Syncing profile...");
		if (commandExists("rsync")) {
			execSync(
				`rsync -a --delete \
					--exclude='SingletonLock' \
					--exclude='SingletonSocket' \
					--exclude='SingletonCookie' \
					--exclude='*/Sessions/*' \
					--exclude='*/Current Session' \
					--exclude='*/Current Tabs' \
					--exclude='*/Last Session' \
					--exclude='*/Last Tabs' \
					"${src}/" "${SCRAPING_DIR}/"`,
				{ stdio: "pipe" },
			);
		} else {
			// Fallback: plain copy (no --delete semantics, sufficient for first sync)
			execSync(`cp -a "${src}/." "${SCRAPING_DIR}/"`, { stdio: "pipe" });
		}
	}
}

const chromePath = findChrome();
if (!chromePath) {
	console.error("✗ No Chrome/Chromium executable found.");
	console.error("  Set CHROME_PATH=/path/to/chrome and retry.");
	process.exit(1);
}

// Start Chrome with flags to force new instance
spawn(
	chromePath,
	[
		"--remote-debugging-port=9222",
		`--user-data-dir=${SCRAPING_DIR}`,
		"--no-first-run",
		"--no-default-browser-check",
	],
	{ detached: true, stdio: "ignore" },
).unref();

// Wait for Chrome to be ready
let connected = false;
for (let i = 0; i < 30; i++) {
	try {
		const browser = await puppeteer.connect({
			browserURL: "http://localhost:9222",
			defaultViewport: null,
		});
		await browser.disconnect();
		connected = true;
		break;
	} catch {
		await new Promise((r) => setTimeout(r, 500));
	}
}

if (!connected) {
	console.error(`✗ Failed to connect to Chrome (tried: ${chromePath})`);
	process.exit(1);
}

console.log(`✓ Chrome started on :9222${useProfile ? " with your profile" : ""} (${chromePath})`);
