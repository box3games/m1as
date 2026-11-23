import assert from "node:assert/strict";
import testCase from "node:test";
import {
  buildCharacterVolumePosePlan,
  validateCharacterVolumeEnvelope,
  type CharacterVolumeEnvelope,
  type CharacterVolumePoseRequest,
} from "./character-volume-pose-bridge-contract.js";

const envelope: CharacterVolumeEnvelope = {
  envelopeId: "hero-envelope",
  subjectId: "hero",
  referenceDimensionsMeters: { width: 0.6, height: 1.8, depth: 0.35 },
  currentDimensionsMeters: { width: 0.6, height: 1.8, depth: 0.35 },
  coordinateSpace: "subject-local",
  provenance: "authored-character-volume-v1",
};

const request: CharacterVolumePoseRequest = {
  requestId: "squat-01",
  subjectId: "hero",
  poseKind: "compressed-squat",
  envelopeScale: { width: 1.15, height: 0.4, depth: 1.2 },
  jointTargets: [
    { jointId: "Spine", channel: "rotation-x", value: 0.35, unit: "radians" },
    { jointId: "LeftKnee", channel: "rotation-x", value: 1.1, unit: "radians" },
  ],
  supportedRepresentations: ["2d", "2.5d", "3d"],
  simulationTimeSeconds: 4,
  configurationVersion: "pose-config-1",
  growthStateId: "growth-17",
};

testCase("validates a shared character volume envelope", () => {
  assert.doesNotThrow(() => validateCharacterVolumeEnvelope(envelope));
});

testCase("builds consistent 2D, 2.5D and 3D envelope projections", () => {
  const plan = buildCharacterVolumePosePlan(envelope, request);
  assert.equal(plan.targetDimensionsMeters.height, 0.72);
  assert.equal(plan.targetDimensionsMeters.width, 0.69);
  assert.equal(plan.projection.twoD.heightRatio, 0.4);
  assert.equal(plan.projection.twoPointFiveD.depthRatio, 1.2);
  assert.equal(plan.projection.threeD.widthRatio, 1.15);
  assert.equal(plan.jointTargets.length, 2);
});

testCase("retains actual growth authority while requesting pose compression", () => {
  const plan = buildCharacterVolumePosePlan(envelope, request);
  assert.deepEqual(plan.authority, {
    actualGrowthScaleModified: false,
    skeletonTransformsApplied: false,
    spriteTransformsApplied: false,
    physicsExecuted: false,
    animationRendered: false,
  });
});

testCase("supports a 2D-only VFXR target without requiring a skeleton", () => {
  const plan = buildCharacterVolumePosePlan(envelope, {
    ...request, supportedRepresentations: ["2d"], jointTargets: [],
  });
  assert.deepEqual(plan.supportedRepresentations, ["2d"]);
  assert.equal(plan.jointTargets.length, 0);
});

testCase("supports micro-scale envelopes without a size threshold", () => {
  const micro = {
    ...envelope,
    referenceDimensionsMeters: { width: 1e-9, height: 2e-9, depth: 1e-9 },
    currentDimensionsMeters: { width: 1e-9, height: 2e-9, depth: 1e-9 },
  };
  const plan = buildCharacterVolumePosePlan(micro, {
    ...request, envelopeScale: { width: 1, height: 0.7, depth: 1 },
  });
  assert.equal(plan.targetDimensionsMeters.height, 1.4e-9);
});

testCase("rejects mismatched subject identity and invalid compression", () => {
  assert.throws(() => buildCharacterVolumePosePlan(envelope, {
    ...request, subjectId: "other",
  }), /subject/);
  assert.throws(() => buildCharacterVolumePosePlan(envelope, {
    ...request, envelopeScale: { width: 1, height: 0, depth: 1 },
  }), /finite positive/);
});

testCase("rejects duplicate joint channels and duplicate representation targets", () => {
  assert.throws(() => buildCharacterVolumePosePlan(envelope, {
    ...request,
    jointTargets: [request.jointTargets![0], request.jointTargets![0]],
  }), /Duplicate joint target/);
  assert.throws(() => buildCharacterVolumePosePlan(envelope, {
    ...request, supportedRepresentations: ["2d", "2d"],
  }), /unique/);
});
