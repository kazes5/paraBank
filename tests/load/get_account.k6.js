// L1 read baseline and L2 read step load: GET /accounts/{S} (tests/load/load_test_plan.md §4)
//   k6 run -e TEST=L1|L2 -e S=<accountId> tests/load/get_account.k6.js
// L2 uses an arrival-rate model: the server gets a fixed rate whatever its speed, and k6 adds
// VUs (up to 10) when responses slow down.

import exec from 'k6/execution';
import { getAccount, safety, S, TEST } from './lib.js';

// Length of one L2 load step; used to tag each request with the step it belongs to.
const STEP_MS = 45000;
const scenarios = {
  // 1 VU, 1 request every 1.5 s, 90 s → 60 requests
  L1: { executor: 'constant-arrival-rate', rate: 2, timeUnit: '3s', duration: '90s', preAllocatedVUs: 1, maxVUs: 1 },
  // 0.67 → 1 → 1.5 → 2 req/s, 45 s each (rates per 6 s: 4, 6, 9, 12), up to 10 VUs → ~230 requests
  L2: {
    executor: 'ramping-arrival-rate',
    startRate: 4,
    timeUnit: '6s',
    preAllocatedVUs: 2,
    maxVUs: 10,
    stages: [
      { target: 4, duration: '45s' },
      { target: 6, duration: '1s' },
      { target: 6, duration: '44s' },
      { target: 9, duration: '1s' },
      { target: 9, duration: '44s' },
      { target: 12, duration: '1s' },
      { target: 12, duration: '44s' },
    ],
  },
};

// Run only the scenario named by -e TEST, with the shared safety thresholds (abort on 429 / errors / slowness).
export const options = {
  scenarios: scenarios[TEST] ? { [TEST]: scenarios[TEST] } : undefined,
  thresholds: safety,
  summaryTrendStats: ['min', 'med', 'p(90)', 'p(95)', 'max', 'count'],
};

// One iteration = one read of S. For L2, step = which 45 s stage is running (1-4), so p95 is reported per step.
export default function () {
  const step = TEST === 'L2' ? Math.min(4, 1 + Math.floor((Date.now() - exec.scenario.startTime) / STEP_MS)) : 1;
  getAccount(S, step);
}
