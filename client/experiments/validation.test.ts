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

import { ExperimentTimeline } from './timeline.js';

test('opportunity requests remain distinct from outcome requests', () => {
  const request: GrowthRequestRecord = {
    recordId: 'r2', experimentId: 'e1', schemaVersion: 1,
    time: { simulationTimeSeconds: 1.5, sequenceNumber: 2 },
    requestId: 'q2', mode: 'opportunity', source: 'gameplay',
    opportunity: { opportunityType: 'consumable_contact', sourceId: 'prop-1', context: { propRole: 'consumable' } },
  };
  assert.deepEqual(validateGrowthRequest(request), []);
});

test('experiment timeline keeps simulation time authoritative and sequence monotonic', () => {
  const timeline = new ExperimentTimeline();
  const first = timeline.next(0.25, 10);
  const second = timeline.next(0.25, 10);
  const third = timeline.next(0.5, 11);
  assert.equal(first.simulationTimeSeconds, 0.25);
  assert.equal(first.sequenceNumber, 0);
  assert.equal(second.sequenceNumber, 1);
  assert.equal(third.sequenceNumber, 2);
  assert.throws(() => timeline.next(0.4), RangeError);
});
