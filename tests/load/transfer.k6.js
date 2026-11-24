// L3 transfer baseline and L4 concurrent transfers: POST /transfer S → T, 1.00 (load_test_plan.md §4)
//   k6 run -e TEST=L3|L4 -e S=<id> -e T=<id> tests/load/transfer.k6.js
// L4: 5 VUs fire together at the start of every 7.5 s slot (16 rounds = 80 transfers). The average
// rate stays at the safe 0.67 req/s, but each round puts 5 simultaneous writes on the same two rows.

import exec from 'k6/execution';
import { sleep } from 'k6';
import { transfer, safety, S, T, TEST } from './lib.js';

const SLOT_MS = 7500;
const scenarios = {
  // 1 VU, 1 transfer every 2 s, 60 s → 30 transfers
  L3: { executor: 'constant-arrival-rate', rate: 1, timeUnit: '2s', duration: '60s', preAllocatedVUs: 1, maxVUs: 1 },
  L4: { executor: 'per-vu-iterations', vus: 5, iterations: 16, maxDuration: '3m' },
};

export const options = {
  scenarios: scenarios[TEST] ? { [TEST]: scenarios[TEST] } : undefined,
  thresholds: safety,
  summaryTrendStats: ['min', 'med', 'p(90)', 'p(95)', 'max', 'count'],
};

export default function () {
  let round = 1;
  if (TEST === 'L4') {
    // wait for this round's slot so all VUs send at the same moment
    round = exec.vu.iterationInScenario + 1;
    const fireAt = exec.scenario.startTime + 1000 + (round - 1) * SLOT_MS;
    const wait = fireAt - Date.now();
    if (wait > 0) sleep(wait / 1000);
  }
  transfer(S, T, round);
}
