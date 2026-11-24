// Results housekeeping: keep a run, list runs, find the latest summary, rebuild the index.
//
// Usage: node tests/scripts/results.mjs keep <runId|latest>
//        node tests/scripts/results.mjs list
//        node tests/scripts/results.mjs latest [kind]
//        node tests/scripts/results.mjs index

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { findRun, keepRun, rebuildIndex } from './lib/common.mjs';

// One subcommand per call; any error prints its message and exits 1.
const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'keep') {
    // keep: "last" (or nothing) = the run recorded in results/.last-run by the most recent command.
    const lastFile = join('results', '.last-run');
    const ref =
      !arg || arg === 'last' ? (existsSync(lastFile) ? readFileSync(lastFile, 'utf8').trim() : 'latest') : arg;
    const r = keepRun(ref);
    console.log(`Kept: ${r.dir} (commit it to share)`);
  } else if (cmd === 'list') {
    // list: refresh and print the index of all runs.
    rebuildIndex();
    console.log(readFileSync('results/index.md', 'utf8'));
  } else if (cmd === 'latest') {
    // latest: path of the newest run's summary, optionally of one kind (api, ui, manual, repro, load, auto).
    console.log(join(findRun('latest', { kind: arg }).dir, 'summary.md'));
  } else if (cmd === 'index') {
    // index: rebuild results/index.md and results/history.md.
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
