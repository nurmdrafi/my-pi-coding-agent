#!/usr/bin/env node
// web-fetch.mjs — HEADLESS URL → clean markdown. No browser / puppeteer / DOM-eval.
// Reuses deps already installed under skills/browser-tools/node_modules:
//   jsdom, @mozilla/readability, turndown, turndown-plugin-gfm
// Usage:  node web-fetch.mjs <url> [maxChars]   (maxChars=0 → unlimited)
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const url = process.argv[2];
const maxChars = Number(process.argv[3] || 0);
if (!url) {
  console.error("usage: web-fetch.mjs <url> [maxChars]");
  process.exit(1);
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

let res;
try {
  res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
  });
} catch (e) {
  console.error("fetch error:", e.message);
  process.exit(2);
}
if (!res.ok) {
  console.error(`HTTP ${res.status} ${res.statusText}`);
  process.exit(2);
}

const html = await res.text();
const dom = new JSDOM(html, { url });
const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
td.use(gfm);

let md;
try {
  const article = new Readability(dom.window.document).parse();
  md = article && article.content ? td.turndown(article.content) : null;
} catch {
  md = null;
}

if (md == null) {
  // Fallback for non-article pages (GitHub dirs, sparse pages): strip chrome, convert body.
  const doc = dom.window.document;
  doc
    .querySelectorAll("script,style,noscript,svg,nav,footer,header,aside,form,iframe,button")
    .forEach((e) => e.remove());
  md = td.turndown(doc.body ? doc.body.innerHTML : html);
}

md = md.replace(/\n{3,}/g, "\n\n").trim();
if (maxChars > 0 && md.length > maxChars) md = md.slice(0, maxChars) + "\n\n…[truncated]";
process.stdout.write(md + "\n");
