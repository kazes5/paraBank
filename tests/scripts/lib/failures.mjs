// Extracts the FAILED records of an API run (written by every failing request in the collection)
// and files them per defect: <outRoot>/BUG-0NN/stage3-failures.json.
//
// The Postman CLI prints console.log output as a quoted JavaScript string (util.inspect style),
// wrapped over many lines: the lines are joined, each quoted literal is unescaped, then parsed.
//
// Default source: the latest *kept* API run (committed evidence).
// CLI: node tests/scripts/lib/failures.mjs [apiRunId|latest] [outRoot]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { findRun } from './common.mjs';

// Defect -> STD case IDs that detect it (Bug_Reports.md)
export const CASES = {
  'BUG-001': ['TRF-09'], 'BUG-002': ['CUST-03', 'ACCT-04'], 'BUG-003': ['TRF-03', 'DEP-03', 'WDR-03', 'BILL-04'], 'BUG-004': ['TRF-02', 'WDR-02', 'BILL-02'],
  'BUG-005': ['LOAN-04'], 'BUG-006': ['LOAN-01', 'JRN-01 J13e'], 'BUG-007': ['BILL-03'], 'BUG-008': ['AUTH-03'], 'BUG-009': ['JRN-01 J06b'],
  'BUG-010': ['TRF-04', 'DEP-02', 'WDR-04'], 'BUG-011': ['TRF-05'], 'BUG-012': ['TRF-07'], 'BUG-013': ['HIST-04'], 'BUG-014': ['HIST-05'],
  'BUG-015': ['HIST-01', 'LOAN-01', 'JRN-01 J13a'],
};

const unescape = (s) => s.replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r' })[c] ?? c);
const defaultApiRun = () => findRun('latest', { kind: 'api', keptOnly: true }).dir;

export function failedRecords(caseIds, apiDir = defaultApiRun()) {
  const out = [];
  for (const phase of ['smoke', 'suites', 'journey']) {
    const p = [join(apiDir, 'logs', `${phase}.log`), join(apiDir, `${phase}.log`)].find((f) => existsSync(f));
    if (!p) continue;
    const joined = readFileSync(p, 'utf8').split('\n').filter((l) => l.startsWith('  | ')).map((l) => l.slice(4)).join('');
    for (const m of joined.matchAll(/(['`])(\{"kind":"FAILED".*?\})\1(?=['`]|$)/g)) {
      let rec;
      try { rec = JSON.parse(unescape(m[2])); } catch { continue; }
      if (caseIds.some((c) => rec.case === c || rec.case.startsWith(`${c} `) || rec.case.startsWith(c))) out.push({ phase, ...rec });
    }
  }
  return out;
}

export function writeAll(outRoot, apiDir = defaultApiRun()) {
  const summary = {};
  for (const [bug, ids] of Object.entries(CASES)) {
    const recs = failedRecords(ids, apiDir);
    summary[bug] = recs.length;
    if (!recs.length) continue;
    mkdirSync(join(outRoot, bug), { recursive: true });
    writeFileSync(join(outRoot, bug, 'stage3-failures.json'), `${JSON.stringify({ sourceRun: apiDir, records: recs }, null, 2)}\n`);
  }
  return summary;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const api = findRun(process.argv[2] || 'latest', { kind: 'api', keptOnly: !process.argv[2] }).dir;
  console.log(writeAll(process.argv[3] || 'evidence/bugs', api));
}
