// Results housekeeping: keep a run, list runs, find the latest summary, rebuild the index.
//
// Usage: node tests/scripts/results.mjs keep <runId|latest>
//        node tests/scripts/results.mjs list
//        node tests/scripts/results.mjs latest [kind]
//        node tests/scripts/results.mjs index

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { findRun, keepRun, rebuildIndex } from './lib/common.mjs';

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'keep') {
    const lastFile = join('results', '.last-run');
    const ref = !arg || arg === 'last' ? (existsSync(lastFile) ? readFileSync(lastFile, 'utf8').trim() : 'latest') : arg;
    const r = keepRun(ref);
    console.log(`Kept: ${r.dir} (commit it to share)`);
  } else if (cmd === 'list') {
    rebuildIndex();
    console.log(readFileSync('results/index.md', 'utf8'));
  } else if (cmd === 'latest') {
    console.log(join(findRun('latest', { kind: arg }).dir, 'summary.md'));
  } else if (cmd === 'index') {
    rebuildIndex();
    console.log('Rebuilt results/index.md and results/history.md');
  } else {
    console.error('Usage: results.mjs keep <runId|last> | list | latest [kind] | index');
    process.exit(2);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
