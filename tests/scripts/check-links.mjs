// Checks that every repo path mentioned in the documents exists (backticked paths and markdown links).
// Placeholders such as <runId>, BUG-0NN or <defect-id> are skipped.
//
// Usage: node tests/scripts/check-links.mjs   (exit 1 if a path is missing)

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { ROOT } from './lib/common.mjs';

const ROOTS = /^(evidence|results|tests|docs|scripts|postman)\//;
const docs = ['README.md', 'STR.md', 'plan.md', 'STD.md', 'Bug_Reports.md', 'Business_Rules.md', 'parabank_test_approach.md'];
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const d of ['evidence', 'results']) docs.push(...walk(d).filter((f) => f.endsWith('.md')));

const missing = [];
let checked = 0;
for (const doc of docs.filter((d) => existsSync(d))) {
  const text = readFileSync(doc, 'utf8');
  const refs = [
    ...[...text.matchAll(/`([^`\s]+)`/g)].map((m) => ({ path: m[1], rel: false })),
    ...[...text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)].map((m) => ({ path: m[1], rel: true })),
  ];
  for (const { path, rel } of refs) {
    if (/^https?:|[<>*{}]|BUG-0NN|NN-/.test(path)) continue;
    const resolved = rel && !ROOTS.test(path) ? normalize(join(dirname(doc), path)) : path.replace(/^\.\//, '');
    if (!rel && !ROOTS.test(resolved)) continue;
    checked++;
    if (!existsSync(join(ROOT, resolved.replace(/[.,:;]+$/, '')))) missing.push(`${doc}: ${path}`);
  }
}
console.log(`Checked ${checked} path references in ${docs.length} documents; missing: ${missing.length}`);
for (const m of [...new Set(missing)]) console.log(`  ${m}`);
process.exit(missing.length ? 1 : 0);
