import { industryOf, transactIndustry, completeIndustryShift, PRODUCTS } from '../../src/game/industry13_core.js';
import { surveyStep13 } from '../../src/game/life13_core.js';

// Uses the actual ledgers. Behaviour and participation are caller assumptions, not retention predictions.
export function visitRelayBroker(run) {
  const before = run.credits, s = industryOf(run);
  for (const job of [...s.jobs]) if (job.physical && job.due <= s.shift) {
    transactIndustry(run, { op: 'calibrate', id: job.id });
    transactIndustry(run, { op: 'pack', id: job.id });
  }
  if (s.report) transactIndustry(run, { op: 'collect' });
  // Cash only the actual ready goods and obey the real per-shift budget.
  for (const product of Object.keys(PRODUCTS)) {
    while (s.goods[product] > 0 && transactIndustry(run, { op: 'sell', product }).ok) {}
  }
  // Maintain a small commission service rather than assuming unlimited working capital.
  while (s.jobs.length < 3 && run.credits > 75) {
    if (!transactIndustry(run, { op: 'produce', product: 'cells', physical: true }).ok) break;
  }
  if (!s.robot && !s.report && run.credits > 120) transactIndustry(run, { op: 'robot', target: 'hamsi' });
  return run.credits - before;
}
export function completeRelayField(run, moon, day) {
  return completeIndustryShift(run, moon, day);
}
export function relaySurveyReward(token) {
  const accepted = surveyStep13(null, 'accept', 0, token);
  const visited = surveyStep13(accepted.state, 'checkpoint', 9, token);
  return surveyStep13(visited.state, 'claim', 16, token).reward || 0;
}
