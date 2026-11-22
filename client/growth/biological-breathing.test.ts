import test from "node:test";
import assert from "node:assert/strict";
import { BiologicalBreathController } from "./biological-breathing.js";

test("a completed breath increases actual scale and makes the next breath longer", () => {
  const controller = new BiologicalBreathController();
  const firstDuration = controller.getCycleDurationSeconds();
  controller.advance(firstDuration);
  const afterFirst = controller.getState();
  assert.equal(afterFirst.completedCycles, 1);
  assert.equal(afterFirst.actualScale, 1.08);
  assert.equal(afterFirst.cycleDurationSeconds, firstDuration * 1.25);
  assert.equal(afterFirst.phase, "inhale");
});

test("actual scale accumulates during inhale while the pulse remains independent", () => {
  const controller = new BiologicalBreathController();
  controller.advance(0.175);
  const midInhale = controller.getState();
  assert.equal(midInhale.phase, "inhale");
  assert.ok(midInhale.actualScale > 1 && midInhale.actualScale < 1.08);
  assert.ok(midInhale.visualExpansion > 0 && midInhale.visualExpansion < 1);

  controller.advance(0.175);
  const inhaleEnd = controller.getState();
  assert.equal(inhaleEnd.phase, "hold");
  assert.equal(inhaleEnd.actualScale, 1.08);
  assert.equal(inhaleEnd.visualExpansion, 1);

  controller.advance(0.15);
  const held = controller.getState();
  assert.equal(held.phase, "hold");
  assert.equal(held.actualScale, 1.08);
  assert.equal(held.visualExpansion, 1);
  assert.ok(held.internalPressure > inhaleEnd.internalPressure);
});

test("pressure grows on subsequent breaths while scale accumulation remains separate", () => {
  const controller = new BiologicalBreathController();
  controller.advance(0.35 + 0.3);
  const firstPressure = controller.getState().internalPressure;
  assert.equal(controller.getState().phase, "release");
  assert.equal(controller.getState().actualScale, 1.08);

  controller.advance(0.35);
  assert.equal(controller.getState().actualScale, 1.08);
  controller.advance(0.35 * 1.25 + 0.3 * 1.25);
  const secondReleaseStart = controller.getState();
  assert.equal(secondReleaseStart.phase, "release");
  assert.ok(Math.abs(secondReleaseStart.actualScale - 1.08 ** 2) < 1e-12);
  assert.ok(secondReleaseStart.internalPressure > firstPressure);
});

test("release settles visual expansion and pressure without shrinking accumulated scale", () => {
  const controller = new BiologicalBreathController();
  controller.advance(0.35 + 0.3 + 0.175);
  const release = controller.getState();
  assert.equal(release.phase, "release");
  assert.ok(release.visualExpansion < 1);
  assert.ok(release.internalPressure < 1);
  assert.equal(release.actualScale, 1.08);

  controller.advance(0.175);
  assert.equal(controller.getState().actualScale, 1.08);
  assert.equal(controller.getState().phase, "inhale");
});

test("pressure wave is a separate oscillating response", () => {
  const controller = new BiologicalBreathController({ waveCyclesPerSecond: 2 });
  controller.advance(0.4);
  const first = controller.getState();
  controller.advance(0.125);
  const second = controller.getState();
  assert.notEqual(first.pressureWavePhaseRadians, second.pressureWavePhaseRadians);
  assert.notEqual(first.pressureWave, second.pressureWave);
  assert.equal(second.actualScale, 1.08);
});

test("large simulation steps cross multiple cycles deterministically", () => {
  const controller = new BiologicalBreathController();
  controller.advance(1 + 1.25);
  const state = controller.getState();
  assert.equal(state.completedCycles, 2);
  assert.ok(Math.abs(state.actualScale - 1.08 ** 2) < 1e-12);
  assert.equal(state.cycleDurationSeconds, 1.5625);
});

test("invalid time and invalid progression profiles are rejected", () => {
  const controller = new BiologicalBreathController();
  assert.throws(() => controller.advance(-1), /finite and non-negative/);
  assert.throws(() => new BiologicalBreathController({
    inhaleFraction: 0.8,
    holdFraction: 0.3,
  }), /sum to less than 1/);
  assert.throws(() => new BiologicalBreathController({
    durationMultiplierPerCycle: 0.9,
  }), /must be at least 1/);
});
