import test from 'node:test';
import assert from 'node:assert/strict';
import { GrowthEventQueue, GrowthStimulusType } from '../GrowthEventQueue.js';

test('release observer receives a copy without consuming the ready queue', () => {
  const queue = new GrowthEventQueue(1);
  let observed = 0;
  queue.onEventReleased = event => {
    observed += 1;
    event.newScale = -999;
  };
  queue.push(1, 1.5, GrowthStimulusType.Consumption, 0.001);
  assert.doesNotThrow(() => queue.step(0.002));
  assert.equal(observed, 1);
  assert.equal(queue.pendingCount, 0);
  assert.equal(queue.hasEvents, true);
  const ready = queue.pop();
  assert.ok(ready);
  assert.equal(ready.newScale, 1.5);
});

test('observer exceptions cannot interrupt queue stepping or release', () => {
  const queue = new GrowthEventQueue(1);
  queue.onEventReleased = () => { throw new Error('observer failure'); };
  queue.push(1, 1.25, GrowthStimulusType.Consumption, 0.001);
  assert.doesNotThrow(() => queue.step(0.002));
  assert.equal(queue.pendingCount, 0);
  assert.equal(queue.hasEvents, true);
});


test('sustained growth feed advances the existing spring target without queuing per-frame events', () => {
  const queue = new GrowthEventQueue(1);
  queue.feedSustainedGrowth(0.25, GrowthStimulusType.Buff);
  queue.feedSustainedGrowth(0.25, GrowthStimulusType.Buff);
  assert.equal(queue.currentTargetScale, 1.5);
  assert.equal(queue.pendingCount, 0);
  assert.equal(queue.hasEvents, false);
  const frame = queue.step(0.05);
  assert.ok(frame.absoluteFinalScale > 1);
});
