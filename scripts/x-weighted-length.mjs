// Reports twitter-text v3 weighted lengths for the ```text blocks in a file.
//
// X does not count characters naively: URLs are transformed to 23 characters,
// and any character outside the weight-100 ranges costs two. U+2192 RIGHTWARDS
// ARROW is one of those, so every "→" in a draft costs two, not one.
//
// Ranges and constants mirror:
//   https://raw.githubusercontent.com/twitter/twitter-text/master/config/v3.json
//
// Run: npm run posts:length -- docs/launch/posts.md

import { readFileSync } from "node:fs";

const WEIGHT_100_RANGES = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
const DEFAULT_WEIGHT = 200;
const SCALE = 100;
const TRANSFORMED_URL_LENGTH = 23;
const MAX = 280;

export function weightedLength(text) {
  const normalized = text.replace(/https?:\/\/\S+/g, "X".repeat(TRANSFORMED_URL_LENGTH));
  let total = 0;
  for (const ch of normalized) {
    const cp = ch.codePointAt(0);
    const light = WEIGHT_100_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
    total += light ? SCALE : DEFAULT_WEIGHT;
  }
  return Math.floor(total / SCALE);
}

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/x-weighted-length.mjs <file.md>");
  process.exit(64);
}

const source = readFileSync(file, "utf8");
const blocks = [...source.matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n+$/, ""));

let over = 0;
for (const [index, block] of blocks.entries()) {
  if (block.length > 700) continue; // long-form Show HN / community bodies
  const length = weightedLength(block);
  const heavy = [...new Set([...block.replace(/https?:\/\/\S+/g, "")]
    .filter((ch) => {
      const cp = ch.codePointAt(0);
      return !WEIGHT_100_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
    }))].join("");
  const status = length <= MAX ? "ok" : `OVER by ${length - MAX}`;
  if (length > MAX) over += 1;
  console.log(`  block ${String(index).padStart(2)}  ${String(length).padStart(3)}/${MAX}  ${status}${heavy ? `  heavy: ${heavy}` : ""}`);
}

console.log(over === 0 ? "\nAll short-form blocks fit." : `\n${over} block(s) exceed ${MAX}.`);
process.exit(over === 0 ? 0 : 1);
