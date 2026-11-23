import test from "node:test";
import assert from "node:assert/strict";
import { measureScaleEnvironmentRelationship } from "./scale-environment-relationship-contract.js";
import {
  evaluateStructuralResponses,
  type StructuralResponseObservation,
  type StructuralResponseRule,
} from "./environment-structural-response-contract.js";

function observation(): StructuralResponseObservation {
  return {
    observationId: "structural-sample-001",
    relationship: measureScaleEnvironmentRelationship({
      sampleId: "scale-sample-001",
      subjectId: "player",
      referenceId: "glass-wall",
      simulationTimeSeconds: 5,
      configurationVersion: "cfg-v2",
      growthStateId: "growth-9",
      subjectBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 3, z: 2 } },
      referenceBounds: { min: { x: 1.9, y: 0, z: -1 }, max: { x: 2.1, y: 4, z: 3 } },
    }),
    signals: {
      stressRatio: { status: "available", value: 0.92, unit: "ratio", source: "solver-a", confidence: "measured" },
      strainRatio: { status: "available", value: 0.4, unit: "ratio", source: "solver-a", confidence: "measured" },
    },
    provenance: { sourceId: "structural-solver-a", sourceVersion: "1.2", sourceKind: "structural-solver" },
  };
}

test("emits portable visual response events from shared relationship measurements", () => {
  const rules: StructuralResponseRule[] = [{
    ruleId: "glass-stress",
    metric: "stressRatio",
    operator: "greater-than-or-equal",
    threshold: 0.8,
    releaseThreshold: 0.7,
    channel: "visual-effect",
    effectKind: "crack-overlay",
    responseId: "glass-stress-crack",
    severity: "warning",
    priority: 10,
    targetId: "vfxr.glass.cracks",
    asset: { kind: "sprite-sequence", assetId: "glass-crack-growth-01" },
  }];
  const result = evaluateStructuralResponses(observation(), rules);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].channel, "visual-effect");
  assert.equal(result.events[0].effectKind, "crack-overlay");
  assert.equal(result.events[0].confidence, "measured");
  assert.equal(result.events[0].asset?.kind, "sprite-sequence");
  assert.equal(result.authority.visualEffectExecuted, false);
  assert.equal(result.authority.structuralDamageApplied, false);
});

test("does not infer stress or fracture from AABB overlap when solver data is missing", () => {
  const input = observation();
  input.signals = { stressRatio: { status: "not_captured", reason: "No structural solver connected." } };
  const result = evaluateStructuralResponses(input, [{
    ruleId: "stress",
    metric: "stressRatio",
    operator: "greater-than-or-equal",
    threshold: 0.8,
    channel: "structural-integrity",
    effectKind: "failure-evaluation",
    responseId: "evaluate-failure",
    severity: "critical",
    priority: 1,
  }]);
  assert.equal(result.evaluations[0].state, "unavailable");
  assert.equal(result.events.length, 0);
});

test("uses geometry-derived penetration metrics without claiming physical force", () => {
  const result = evaluateStructuralResponses(observation(), [{
    ruleId: "wall-contact",
    metric: "penetrationDepthX",
    operator: "greater-than-or-equal",
    threshold: 0.05,
    channel: "visual-effect",
    effectKind: "impact-flash",
    responseId: "wall-contact-flash",
    severity: "info",
    priority: 2,
  }]);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].confidence, "relationship-derived");
});

test("supports rule entry, maintenance, hysteresis release, and deterministic event IDs", () => {
  const rules: StructuralResponseRule[] = [{
    ruleId: "stress-glow",
    metric: "stressRatio",
    operator: "greater-than-or-equal",
    threshold: 0.8,
    releaseThreshold: 0.7,
    channel: "visual-effect",
    effectKind: "stress-glow",
    responseId: "stress-glow",
    severity: "warning",
    priority: 1,
  }];
  const high = evaluateStructuralResponses(observation(), rules);
  assert.equal(high.evaluations[0].state, "entered");
  assert.equal(high.events[0].eventId, "structural-sample-001:stress-glow");
  const held = observation();
  held.signals.stressRatio = { status: "available", value: 0.75, unit: "ratio", source: "solver-a", confidence: "measured" };
  assert.equal(evaluateStructuralResponses(held, rules, ["stress-glow"]).evaluations[0].state, "maintained");
  held.signals.stressRatio = { status: "available", value: 0.6, unit: "ratio", source: "solver-a", confidence: "measured" };
  assert.equal(evaluateStructuralResponses(held, rules, ["stress-glow"]).evaluations[0].state, "exited");
});

test("supports sprite, WEBM, and procedural response assets without binding to one renderer", () => {
  const rules: StructuralResponseRule[] = [
    { ruleId: "sprite", metric: "heightOccupancyRatio", operator: "greater-than-or-equal", threshold: 0.1,
      channel: "visual-effect", effectKind: "sprite-sequence", responseId: "sprite", severity: "info",
      priority: 1, asset: { kind: "sprite-sequence", assetId: "sprite-crack" } },
    { ruleId: "webm", metric: "heightOccupancyRatio", operator: "greater-than-or-equal", threshold: 0.1,
      channel: "visual-effect", effectKind: "webm-overlay", responseId: "webm", severity: "info",
      priority: 2, asset: { kind: "webm", assetId: "debris-webm" } },
    { ruleId: "procedural", metric: "heightOccupancyRatio", operator: "greater-than-or-equal", threshold: 0.1,
      channel: "visual-effect", effectKind: "procedural-overlay", responseId: "procedural", severity: "info",
      priority: 3, asset: { kind: "procedural", assetId: "dust-procedural" } },
  ];
  const result = evaluateStructuralResponses(observation(), rules);
  assert.deepEqual(result.events.map(event => event.asset?.kind), ["sprite-sequence", "webm", "procedural"]);
});

test("rejects malformed rules and stale active state", () => {
  const valid: StructuralResponseRule = {
    ruleId: "r", metric: "stressRatio", operator: "greater-than-or-equal", threshold: 0.5,
    channel: "visual-effect", effectKind: "stress-glow", responseId: "r", severity: "info", priority: 0,
  };
  assert.throws(() => evaluateStructuralResponses(observation(), [{ ...valid, releaseThreshold: 0.8 }]), /releaseThreshold/);
  assert.throws(() => evaluateStructuralResponses(observation(), [valid], ["removed"]), /absent/);
  assert.throws(() => evaluateStructuralResponses(observation(), [valid, valid]), /Duplicate/);
});
