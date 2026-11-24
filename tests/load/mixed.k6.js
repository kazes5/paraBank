// L5 reads during writes (optional): 3 VUs read S at 1 / 3 s each, 2 VUs transfer S → T at 1 / 6 s each,
// for 2 minutes (load_test_plan.md §4). Each reader also checks that S never goes up (S only decreases).
//   k6 run -e TEST=L5 -e S=<id> -e T=<id> tests/load/mixed.k6.js

import { getAccount, transfer, safety, S, T } from './lib.js';

export const options = {
  scenarios: {
    reads: { executor: 'constant-arrival-rate', rate: 1, timeUnit: '1s', duration: '120s', preAllocatedVUs: 3, maxVUs: 3, exec: 'read' },
    writes: { executor: 'constant-arrival-rate', rate: 1, timeUnit: '3s', duration: '120s', preAllocatedVUs: 2, maxVUs: 2, exec: 'write' },
  },
  thresholds: safety,
  summaryTrendStats: ['min', 'med', 'p(90)', 'p(95)', 'max', 'count'],
};

let last = Infinity; // per VU
export function read() {
  const body = getAccount(S, 1, { 'S balance never goes up': (b) => b !== null && b.balance <= last + 1e-9 });
  if (body && typeof body.balance === 'number') last = Math.min(last, body.balance);
}

export function write() {
  transfer(S, T, 1);
}

export default read;
