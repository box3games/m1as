import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateScaleEnvironmentResponses,
  measureScaleEnvironmentRelationship,
  placementToWorldAabbMeters,
  type EnvironmentResponseRule,
  type ScaleEnvironmentObservation,
} from "./scale-environment-relationship-contract.js";

function observation(overrides: Partial<ScaleEnvironmentObservation> = {}): ScaleEnvironmentObservation {
  return {
    sampleId: "sample-001",
    subjectId: "player",
    referenceId: "room",
    simulationTimeSeconds: 12,
    configurationVersion: "cfg-v1",
    growthStateId: "growth-7",
    subjectBounds: {
      min: { x: -1, y: 0, z: -1 },
      max: { x: 1, y: 2, z: 1 },
    },
    referenceBounds: {
      min: { x: -5, y: 0, z: -5 },
      max: { x: 5, y: 4, z: 5 },
    },
    ...overrides,
  };
}

test("measures a subject contained by a room with independent occupancy ratios", () => {
  const result = measureScaleEnvironmentRelationship(observation());
  assert.equal(result.spatialState, "subject-contained");
  assert.equal(result.subjectInsideReference, true);
  assert.equal(result.subjectToReferenceHeightRatio, 0.5);
  assert.equal(result.widthOccupancyRatio, 0.2);
  assert.equal(result.depthOccupancyRatio, 0.2);
  assert.equal(result.horizontalFootprintOccupancyRatio, 0.04);
  assert.equal(result.minimumClearanceMeters, 0);
});

test("detects a growing subject exceeding the room while preserving actual bounds", () => {
  const result = measureScaleEnvironmentRelationship(observation({
    subjectBounds: {
      min: { x: -6, y: 0, z: -6 },
      max: { x: 6, y: 8, z: 6 },
    },
  }));
  assert.equal(result.spatialState, "reference-contained");
  assert.equal(result.referenceInsideSubject, true);
  assert.equal(result.widthOccupancyRatio, 1.2);
  assert.equal(result.heightOccupancyRatio, 2);
  assert.equal(result.horizontalFootprintOccupancyRatio, 1.44);
});

test("distinguishes separation, exact touching, and volumetric overlap", () => {
  const separated = measureScaleEnvironmentRelationship(observation({
    subjectBounds: { min: { x: 6, y: 0, z: 0 }, max: { x: 8, y: 2, z: 2 } },
  }));
  assert.equal(separated.spatialState, "separated");
  assert.equal(separated.minimumClearanceMeters, 1);
  const touching = measureScaleEnvironmentRelationship(observation({
    subjectBounds: { min: { x: 5, y: 0, z: -1 }, max: { x: 7, y: 2, z: 1 } },
  }));
  assert.equal(touching.spatialState, "touching");
  const overlap = measureScaleEnvironmentRelationship(observation({
    subjectBounds: { min: { x: 4, y: 1, z: 0 }, max: { x: 6, y: 3, z: 2 } },
  }));
  assert.equal(overlap.spatialState, "overlapping");
  assert.equal(overlap.penetrationDepthMeters.x, 1);
  assert.equal(overlap.penetrationDepthMeters.y, 1);
});

test("handles a subject wholly beyond the world envelope without clamping", () => {
  const result = measureScaleEnvironmentRelationship(observation({
    subjectBounds: { min: { x: 20, y: 0, z: 20 }, max: { x: 22, y: 2, z: 22 } },
  }));
  assert.equal(result.spatialState, "separated");
  assert.ok(result.minimumClearanceMeters > 0);
});

test("converts a ground-contact spatial placement into a canonical metre AABB", () => {
  const bounds = placementToWorldAabbMeters({
    positionMeters: { x: 2, y: 3, z: -4 },
    dimensions: { widthMeters: 4, heightMeters: 6, depthMeters: 8 },
  });
  assert.deepEqual(bounds, {
    min: { x: 0, y: 3, z: -8 },
    max: { x: 4, y: 9, z: 0 },
  });
});

test("fires response cues on threshold entry and maintains hysteresis until release", () => {
  const rules: EnvironmentResponseRule[] = [{
    ruleId: "room-nearly-full",
    metric: "heightOccupancyRatio",
    operator: "greater-than-or-equal",
    threshold: 0.8,
    releaseThreshold: 0.7,
    responseKind: "visual-cue",
    responseId: "ceiling-stress-glow",
    priority: 10,
  }];
  const high = measureScaleEnvironmentRelationship(observation({
    subjectBounds: { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 3.5, z: 1 } },
  }));
  const entered = evaluateScaleEnvironmentResponses(high, rules);
  assert.equal(entered.evaluations[0].state, "entered");
  assert.equal(entered.requestedResponses.length, 1);
  const mid = measureScaleEnvironmentRelationship(observation({
    subjectBounds: { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 3, z: 1 } },
  }));
  const maintained = evaluateScaleEnvironmentResponses(mid, rules, ["room-nearly-full"]);
  assert.equal(maintained.evaluations[0].state, "maintained");
  const low = measureScaleEnvironmentRelationship(observation({
    subjectBounds: { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2.5, z: 1 } },
  }));
  const exited = evaluateScaleEnvironmentResponses(low, rules, ["room-nearly-full"]);
  assert.equal(exited.evaluations[0].state, "exited");
  assert.equal(exited.requestedResponses.length, 0);
});

test("orders response requests by priority and never executes them", () => {
  const measurement = measureScaleEnvironmentRelationship(observation({
    subjectBounds: { min: { x: -6, y: 0, z: -6 }, max: { x: 6, y: 8, z: 6 } },
  }));
  const rules: EnvironmentResponseRule[] = [
    { ruleId: "transition", metric: "heightOccupancyRatio", operator: "greater-than-or-equal",
      threshold: 1, responseKind: "transition-request", responseId: "next-world", priority: 50 },
    { ruleId: "destruction", metric: "widthOccupancyRatio", operator: "greater-than-or-equal",
      threshold: 1, responseKind: "destruction-candidate", responseId: "wall-break", priority: 20 },
  ];
  const result = evaluateScaleEnvironmentResponses(measurement, rules);
  assert.deepEqual(result.requestedResponses.map(item => item.ruleId), ["destruction", "transition"]);
  assert.equal(result.authority.responseExecuted, false);
  assert.equal(result.authority.destructionExecuted, false);
  assert.equal(result.authority.growthStateModified, false);
});

test("rejects malformed bounds, metadata, duplicate rules, and invalid thresholds", () => {
  assert.throws(() => measureScaleEnvironmentRelationship(observation({
    subjectBounds: { min: { x: 2, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
  })), /invalid x bounds/);
  assert.throws(() => measureScaleEnvironmentRelationship(observation({
    simulationTimeSeconds: -1,
  })), /simulationTimeSeconds/);
  const measurement = measureScaleEnvironmentRelationship(observation());
  const invalidRule: EnvironmentResponseRule = {
    ruleId: "bad", metric: "heightOccupancyRatio", operator: "greater-than-or-equal",
    threshold: 0.8, releaseThreshold: 0.9, responseKind: "visual-cue", responseId: "cue", priority: 0,
  };
  assert.throws(() => evaluateScaleEnvironmentResponses(measurement, [invalidRule]), /releaseThreshold/);
  assert.throws(() => evaluateScaleEnvironmentResponses(measurement, [
    { ...invalidRule, releaseThreshold: 0.7 },
    { ...invalidRule, releaseThreshold: 0.7 },
  ]), /Duplicate/);
});
