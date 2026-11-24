// Checks that every repo path mentioned in the documents exists (backticked paths and markdown links).
// Placeholders such as <runId>, BUG-0NN or <defect-id> are skipped.
//
// Usage: node tests/scripts/check-links.mjs   (exit 1 if a path is missing)

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { ROOT } from './lib/common.mjs';

// A path counts as a repo path when it starts with one of these top-level folders.
const ROOTS = /^(deliverables|evidence|results|tests|docs)\//;
// Documents to check: the root documents plus every Markdown file under deliverables/, docs/, evidence/ and results/.
const docs = ['README.md', 'SUBMISSION.md', 'docs/walkthrough.md', 'plan.md', 'parabank_test_approach.md'];
const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
// results/runs/ is local and git-ignored (never shared), so only committed documents are checked.
for (const d of ['deliverables', 'docs', 'evidence', 'results'])
  docs.push(...walk(d).filter((f) => f.endsWith('.md') && !f.startsWith(join('results', 'runs'))));

const missing = [];
let checked = 0;
for (const doc of docs.filter((d) => existsSync(d))) {
  const text = readFileSync(doc, 'utf8');
  // Candidate paths: `backticked` text (repo-root relative) and markdown link targets
  // (relative to the document unless they start with a repo folder).
  const refs = [
    ...[...text.matchAll(/`([^`\s]+)`/g)].map((m) => ({ path: m[1], rel: false })),
    ...[...text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)].map((m) => ({ path: m[1], rel: true })),
  ];
  for (const { path, rel } of refs) {
    // Skip URLs and placeholders, resolve the path, ignore trailing punctuation, record what is missing.
    if (/^https?:|[<>*{}]|BUG-0NN|NN-/.test(path)) continue;
    // Markdown links resolve against the document's folder, exactly as GitHub and the web page do;
    // `backticked` paths are written from the repo root.
    const resolved = rel ? normalize(join(dirname(doc), path)) : path.replace(/^\.\//, '');
    if (!rel && !ROOTS.test(resolved)) continue;
    checked++;
    if (!existsSync(join(ROOT, resolved.replace(/[.,:;]+$/, '')))) missing.push(`${doc}: ${path}`);
  }
}
// Report; exit 1 if anything is missing.
console.log(`Checked ${checked} path references in ${docs.length} documents; missing: ${missing.length}`);
for (const m of [...new Set(missing)]) console.log(`  ${m}`);
process.exit(missing.length ? 1 : 0);
