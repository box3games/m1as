import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TwoDimensionalSpriteGrowthModel } from "./two-dimensional-sprite-growth-model.js";

const subject = {
  subjectId: "sprite-subject",
  assetId: "character-png-v1",
  assetKind: "png",
  initialDimensions: { x: 2, y: 4, z: 0 },
  worldUnit: "m",
};
const context = {
  experimentId: "sprite-growth-test",
  simulationTimeSeconds: 0,
  configurationVersion: "1",
};

test("2D sprite growth preserves source aspect ratio", () => {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
  sprite.scale.set(2, 4, 1);
  const model = new TwoDimensionalSpriteGrowthModel(sprite);
  model.initialize(subject, context);
  const initialRatio = sprite.scale.y / sprite.scale.x;

  const result = model.apply({
    kind: "discrete", commandId: "grow-1", stimulus: "test",
    amount: { kind: "absolute_target", scale: 2 },
  }, context);
  assert.equal(result.accepted, true);
  assert.equal(model.readTelemetry(0).currentScale, 2);
  assert.equal(sprite.scale.y / sprite.scale.x, initialRatio);
  assert.equal(sprite.scale.x, 4);
  assert.equal(sprite.scale.y, 8);
});

test("2D sprite supports interpolated growth and sustained flow", () => {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
  sprite.scale.set(3, 6, 1);
  const model = new TwoDimensionalSpriteGrowthModel(sprite);
  model.initialize(subject, context);
  model.apply({
    kind: "discrete", commandId: "grow-2", stimulus: "test",
    amount: { kind: "relative_change", fraction: 1 },
    requestedDurationSeconds: 2,
  }, context);
  model.advance(1, 1);
  assert.equal(model.readTelemetry(1).currentScale, 1.5);
  assert.equal(sprite.scale.x, 4.5);
  model.apply({
    kind: "flow", commandId: "flow-1", flowMultiplier: 1, supplySeconds: 2,
    parameters: { growthPerSupplySecond: 0.5 },
  }, { ...context, simulationTimeSeconds: 1 });
  model.advance(2, 1);
  assert.equal(model.readTelemetry(2).currentScale, 2);
  assert.equal(sprite.scale.y / sprite.scale.x, 2);
});

test("biological visual expansion is separate from accumulated growth scale", () => {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
  sprite.scale.set(2, 5, 1);
  const model = new TwoDimensionalSpriteGrowthModel(sprite);
  model.initialize(subject, context);
  model.applyBiologicalBreathState({
    completedCycles: 0, cycleIndex: 1, phase: "inhale",
    cycleElapsedSeconds: 1, cycleDurationSeconds: 4,
    actualScale: 1, visualExpansion: 2, internalPressure: 0.5,
    pressureWave: 1, pressureWavePhaseRadians: 0,
  }, 0);
  assert.equal(model.readTelemetry(0).currentScale, 1);
  assert.ok(sprite.scale.x > 2);
  assert.equal(sprite.scale.y / sprite.scale.x, 2.5);
});

test("2D sprite rejects shrinking targets and invalid flow values", () => {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
  const model = new TwoDimensionalSpriteGrowthModel(sprite);
  model.initialize(subject, context);
  const shrink = model.apply({
    kind: "discrete", commandId: "shrink", stimulus: "test",
    amount: { kind: "absolute_target", scale: 0.5 },
  }, context);
  assert.equal(shrink.accepted, false);
  const flow = model.apply({
    kind: "flow", commandId: "bad-flow", flowMultiplier: -1, supplySeconds: 2,
  }, context);
  assert.equal(flow.accepted, false);
});

test("2D sprite reset restores its original dimensions without disposing caller assets", () => {
  const material = new THREE.SpriteMaterial();
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2, 4, 1);
  const model = new TwoDimensionalSpriteGrowthModel(sprite);
  model.initialize(subject, context);
  model.apply({
    kind: "discrete", commandId: "grow", stimulus: "test",
    amount: { kind: "absolute_target", scale: 3 },
  }, context);
  model.reset();
  assert.equal(sprite.scale.x, 2);
  assert.equal(sprite.scale.y, 4);
  model.dispose();
  assert.equal(material.disposed, false);
});
