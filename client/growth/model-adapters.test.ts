import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ThreeObjectScaleGrowthModel } from "./model-adapters.js";

const subject = {
  subjectId: "test-subject",
  assetId: "fixture.glb",
  assetKind: "glb",
  initialDimensions: { x: 1, y: 1, z: 1 },
  worldUnit: "meters",
};
const context = {
  experimentId: "model-test",
  simulationTimeSeconds: 0,
  configurationVersion: "test-v1",
};

test("baseline model applies a duration-driven relative growth trajectory", () => {
  const root = new THREE.Group();
  root.scale.setScalar(2);
  const model = new ThreeObjectScaleGrowthModel(root);
  model.initialize(subject, context);
  const result = model.apply({
    kind: "discrete",
    commandId: "growth-1",
    stimulus: "Consumption",
    amount: { kind: "relative_change", fraction: 0.5 },
    requestedDurationSeconds: 1,
  }, context);
  assert.equal(result.accepted, true);
  model.advance(0.5, 0.5);
  assert.equal(model.readTelemetry(0.5).currentScale, 1.25);
  assert.equal(root.scale.x, 2.5);
  model.advance(1, 0.5);
  assert.equal(model.readTelemetry(1).currentScale, 1.5);
  assert.equal(root.scale.x, 3);
});

test("baseline model consumes Grow Time supply at the configured flow rate", () => {
  const root = new THREE.Group();
  const model = new ThreeObjectScaleGrowthModel(root);
  model.initialize(subject, context);
  model.apply({
    kind: "flow",
    commandId: "flow-1",
    flowMultiplier: 2,
    supplySeconds: 2,
    parameters: { growthPerSupplySecond: 0.1 },
  }, context);
  model.advance(1, 1);
  const telemetry = model.readTelemetry(1);
  assert.equal(telemetry.currentScale, 1.2);
  assert.equal(telemetry.supplyRemainingSeconds, 0);
});

test("baseline model converts hold duration into a charged growth event", () => {
  const root = new THREE.Group();
  const model = new ThreeObjectScaleGrowthModel(root);
  model.initialize(subject, context);
  model.apply({ kind: "hold", commandId: "hold-start", active: true }, context);
  model.advance(2, 2);
  model.apply({ kind: "hold", commandId: "hold-end", active: false }, { ...context, simulationTimeSeconds: 2 });
  model.advance(2.5, 0.5);
  assert.equal(model.readTelemetry(2.5).currentScale, 1.5);
});

test("baseline model reset restores its original object scale", () => {
  const root = new THREE.Group();
  root.scale.setScalar(3);
  const model = new ThreeObjectScaleGrowthModel(root);
  model.initialize(subject, context);
  model.apply({
    kind: "discrete",
    commandId: "growth-reset",
    stimulus: "Buff",
    amount: { kind: "relative_change", fraction: 1 },
  }, context);
  model.reset();
  assert.equal(root.scale.x, 3);
  assert.equal(model.readTelemetry(0).currentScale, 1);
});
