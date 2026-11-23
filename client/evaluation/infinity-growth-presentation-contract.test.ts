import test from "node:test";
import assert from "node:assert/strict";
import {
  validateFramingIntegrityAssessment,
  validateInfinityGrowthPresentation,
  type InfinityGrowthPresentationSnapshot,
} from "./infinity-growth-presentation-contract.js";

function snapshot(overrides: Partial<InfinityGrowthPresentationSnapshot> = {}): InfinityGrowthPresentationSnapshot {
  return {
    schemaVersion: "big3r-infinity-growth-presentation/1.0",
    presentationId: "igp-session-1",
    subjectId: "godzilla-subject",
    configurationVersion: "growth-recipe-v1",
    simulationTimeSeconds: 42,
    growthStateId: "growth-state-42",
    mode: "infinity",
    environmentPolicy: "preserve-calibration",
    environmentPresentationScale: 0.25,
    calibrationAnchorIds: ["city-reference:central-tower"],
    subjectViewportAnchor: { x: 0.5, y: 0.62 },
    backgroundEffects: {
      cameraShake: 0.2,
      backgroundBlur: 0.35,
      backgroundParallax: 0.5,
      horizonShift: -0.15,
    },
    framingIntegritySampleId: "framing-sample-42",
    authorityBoundary: "presentation-only",
    ...overrides,
  };
}

test("IGP validates reverse-world contraction with stable calibration anchors", () => {
  assert.doesNotThrow(() => validateInfinityGrowthPresentation(snapshot()));
});

test("full-world contraction does not retain calibration anchors", () => {
  assert.doesNotThrow(() => validateInfinityGrowthPresentation(snapshot({
    environmentPolicy: "contract-all",
    calibrationAnchorIds: [],
  })));
  assert.throws(() => validateInfinityGrowthPresentation(snapshot({
    environmentPolicy: "contract-all",
  })), /cannot declare calibration anchors/);
});

test("calibration-preserving mode requires at least one stable reference", () => {
  assert.throws(() => validateInfinityGrowthPresentation(snapshot({
    calibrationAnchorIds: [],
  })), /requires at least one stable calibration anchor/);
});

test("native and assisted modes cannot silently contract the environment", () => {
  assert.throws(() => validateInfinityGrowthPresentation(snapshot({
    mode: "native",
    environmentPresentationScale: 0.5,
  })), /Only infinity mode may contract/);
});

test("IGP rejects invalid presentation scales, viewport anchors, and effects", () => {
  assert.throws(() => validateInfinityGrowthPresentation(snapshot({
    environmentPresentationScale: 0,
  })), /must be finite and in/);
  assert.throws(() => validateInfinityGrowthPresentation(snapshot({
    subjectViewportAnchor: { x: 1.2, y: 0.5 },
  })), /subjectViewportAnchor.x/);
  assert.throws(() => validateInfinityGrowthPresentation(snapshot({
    backgroundEffects: { ...snapshot().backgroundEffects, backgroundBlur: 2 },
  })), /backgroundBlur/);
});

test("IGP must preserve the presentation-only authority boundary", () => {
  assert.throws(() => validateInfinityGrowthPresentation(snapshot({
    authorityBoundary: "world-mutation" as never,
  })), /presentation-only/);
});

test("framing integrity assessment captures a recoverable clipping trigger", () => {
  assert.doesNotThrow(() => validateFramingIntegrityAssessment({
    schemaVersion: "big3r-framing-integrity/1.0",
    sampleId: "frame-clip-1",
    subjectId: "godzilla-subject",
    simulationTimeSeconds: 42,
    configurationVersion: "growth-recipe-v1",
    growthStateId: "growth-state-42",
    trigger: "subject-clipped",
    visibleOccupancy: 0.82,
    depthClipped: true,
    nativeRecoveryAvailable: false,
  }));
  assert.throws(() => validateFramingIntegrityAssessment({
    schemaVersion: "big3r-framing-integrity/1.0",
    sampleId: "invalid-frame",
    subjectId: "godzilla-subject",
    simulationTimeSeconds: 42,
    configurationVersion: "growth-recipe-v1",
    growthStateId: "growth-state-42",
    trigger: "none",
    depthClipped: true,
    nativeRecoveryAvailable: true,
  }), /requires an explicit framing trigger/);
});
