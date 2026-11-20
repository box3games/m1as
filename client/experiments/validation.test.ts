import test from 'node:test';
import assert from 'node:assert/strict';
import type { GrowthOutcome, GrowthRequestRecord } from './contracts.js';
import { validateGrowthOutcome, validateGrowthRequest, validateNormalizedRect } from './validation.js';

const validOutcome: GrowthOutcome = {
  components: [
    { kind: 'relative_change', changeFraction: 0.2 },
    { kind: 'absolute_target', targetScale: 4 },
    { kind: 'regional_growth', regionId: 'upper_body', amount: { kind: 'relative_change', changeFraction: 0.1 } },
    { kind: 'authored_profile', profileId: 'colossal-upper-body', profileVersion: '1' },
  ],
  compositionPolicy: 'authored',
  minimumScale: 1,
  maximumScale: 8,
  durationSeconds: 3,
};

test('all four explicit growth representations validate together', () => {
  assert.deepEqual(validateGrowthOutcome(validOutcome), []);
});
test('ambiguous or invalid growth amounts are rejected', () => {
  const invalid: GrowthOutcome = {
    components: [{ kind: 'relative_change', changeFraction: Number.NaN }],
    compositionPolicy: 'additive',
    minimumScale: 5,
    maximumScale: 2,
  };
  assert.ok(validateGrowthOutcome(invalid).length >= 2);
});
test('outcome requests require an outcome and cannot also carry opportunity context', () => {
  const request = {
    recordId: 'r1', experimentId: 'e1', schemaVersion: 1,
    time: { simulationTimeSeconds: 0, sequenceNumber: 0 },
    requestId: 'q1', mode: 'outcome', source: 'harness',
    requestedOutcome: validOutcome,
  } satisfies GrowthRequestRecord;
  assert.deepEqual(validateGrowthRequest(request), []);
  assert.ok(validateGrowthRequest({ ...request, requestedOutcome: undefined }).some(issue => issue.path === 'requestedOutcome'));
});
test('screen-space rectangles are normalized and contained by the viewport', () => {
  assert.deepEqual(validateNormalizedRect({ x: 0.1, y: 0.2, width: 0.5, height: 0.5 }), []);
  assert.ok(validateNormalizedRect({ x: 0.8, y: 0.2, width: 0.5, height: 0.5 }).length > 0);
});
