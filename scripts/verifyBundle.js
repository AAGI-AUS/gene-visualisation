#!/usr/bin/env node
// Smoke-check that `yarn build-one` produced a single self-contained HTML.
// Catches inlining regressions that unit tests can't see (CLAUDE.md warns
// build-one diverges from yarn dev).
const fs = require("fs");
const path = require("path");

const BUNDLE = path.resolve(__dirname, "..", "dist", "index.html");
const EXTERNAL_STYLESHEET = /<link\b[^>]*\brel\s*=\s*["']?stylesheet["']?[^>]*>/i;
const EXTERNAL_SCRIPT = /<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>/i;
const ROOT_MOUNT = /<div\b[^>]*\bid\s*=\s*["']root["'][^>]*>/i;
const INLINE_STYLE = /<style\b[^>]*>[\s\S]{200,}?<\/style>/i;
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]{1000,}?<\/script>/i;
const MIN_BYTES = 50_000;

const fail = (msg) => {
  console.error(`verifyBundle: ${msg}`);
  process.exit(1);
};

if (!fs.existsSync(BUNDLE)) fail(`missing ${BUNDLE} - run \`yarn build-one\` first`);
const html = fs.readFileSync(BUNDLE, "utf8");

const linkMatch = html.match(EXTERNAL_STYLESHEET);
if (linkMatch) fail(`external stylesheet not inlined: ${linkMatch[0]}`);

const scriptMatch = html.match(EXTERNAL_SCRIPT);
if (scriptMatch) fail(`external script not inlined: ${scriptMatch[0]}`);

if (html.length < MIN_BYTES) fail(`bundle suspiciously small: ${html.length} bytes (< ${MIN_BYTES})`);
if (!ROOT_MOUNT.test(html)) fail(`React mount (#root) missing`);
if (!INLINE_STYLE.test(html)) fail(`no inlined <style> block of non-trivial size`);
if (!INLINE_SCRIPT.test(html)) fail(`no inlined <script> block of non-trivial size`);

console.log(`verifyBundle: ok (${(html.length / 1024).toFixed(1)} KiB, mount + inlined style/script present)`);
