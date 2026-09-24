#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const reveal = process.argv.includes("--reveal");
// Mask by default: cookie values (session tokens) land in the agent transcript.
const mask = (v) => (v.length <= 8 ? "•".repeat(v.length) : "••••" + v.slice(-4));

const b = await Promise.race([
	puppeteer.connect({
		browserURL: "http://localhost:9222",
		defaultViewport: null,
	}),
	new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
]).catch((e) => {
	console.error("✗ Could not connect to browser:", e.message);
	console.error("  Run: browser-start.js");
	process.exit(1);
});

const p = (await b.pages()).at(-1) ?? (await b.newPage()); // no restored tab (e.g. profile w/ only extension pages) - open one

if (!p) {
	console.error("✗ No active tab found");
	process.exit(1);
}

const cookies = await p.cookies();

for (const cookie of cookies) {
	console.log(`${cookie.name}: ${reveal ? cookie.value : mask(cookie.value)}`);
	console.log(`  domain: ${cookie.domain}`);
	console.log(`  path: ${cookie.path}`);
	console.log(`  httpOnly: ${cookie.httpOnly}`);
	console.log(`  secure: ${cookie.secure}`);
	console.log("");
}

await b.disconnect();
