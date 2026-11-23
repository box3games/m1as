import assert from "node:assert/strict";
import testCase from "node:test";
import { buildCharacterRigTopology } from "../animation/character-animation-capability-adapter.js";
import { Big3rCharacterPoseAdapter, VfxrCharacterPoseAdapter } from "./character-volume-pose-adapters.js";
import { buildCharacterVolumePosePlan, type CharacterVolumeEnvelope, type CharacterVolumePoseRequest } from "./character-volume-pose-bridge-contract.js";

const envelope: CharacterVolumeEnvelope = {
  envelopeId: "env", subjectId: "hero",
  referenceDimensionsMeters: { width: 0.6, height: 1.8, depth: 0.35 },
  currentDimensionsMeters: { width: 0.6, height: 1.8, depth: 0.35 },
  coordinateSpace: "subject-local", provenance: "test",
};
const request: CharacterVolumePoseRequest = {
  requestId: "pose-1", subjectId: "hero", poseKind: "compressed-squat",
  envelopeScale: { width: 1.1, height: 0.4, depth: 1.1 },
  jointTargets: [{ jointId: "Spine", channel: "rotation-x", value: 0.2, unit: "radians" }],
  supportedRepresentations: ["2d", "2.5d", "3d"],
  simulationTimeSeconds: 1, configurationVersion: "cfg-1", growthStateId: "growth-1",
};
const plan = buildCharacterVolumePosePlan(envelope, request);
const topology = buildCharacterRigTopology({
  rigId: "hero-rig", bones: [{ boneId: "Spine" }],
  authoredMappings: [{ regionId: "spine", boneIds: ["Spine"], deformable: true }],
});
const report = {
  rig: { rigId: "hero-rig" }, topology: topology.topology,
  topologyValidation: topology.validation, executionStatus: "discovery_only" as const,
} as any;

testCase("BIG3R dispatch requires matching rig and explicitly supported joint channels", async () => {
  let submitted = 0;
  const adapter = new Big3rCharacterPoseAdapter(report, {
    targetId: "big3r-rig-target", rigId: "hero-rig",
    supportsJointTarget: () => true,
    submitPoseEvaluation: () => { submitted++; return { accepted: true }; },
  });
  const outcome = await adapter.dispatch(plan);
  assert.equal(outcome.status, "dispatched");
  assert.equal(submitted, 1);
});

testCase("BIG3R refuses inferred or mismatched joint support", async () => {
  const adapter = new Big3rCharacterPoseAdapter(report, {
    targetId: "big3r-rig-target", rigId: "hero-rig",
    supportsJointTarget: () => false,
    submitPoseEvaluation: () => ({ accepted: true }),
  });
  assert.equal((await adapter.dispatch(plan)).status, "unsupported");
});

testCase("VFXR receives the same plan without requiring a skeleton", async () => {
  let received: unknown;
  const adapter = new VfxrCharacterPoseAdapter({
    targetId: "vfxr-2d-author", supportsPoseKind: () => true,
    submitPoseAuthoringRequest: value => { received = value; return { accepted: true }; },
  });
  const outcome = await adapter.dispatch(plan);
  assert.equal(outcome.status, "dispatched");
  assert.equal(received, plan);
});

testCase("VFXR rejects unsupported pose kinds instead of substituting another effect", async () => {
  const adapter = new VfxrCharacterPoseAdapter({
    targetId: "vfxr-2d-author", supportsPoseKind: () => false,
    submitPoseAuthoringRequest: () => ({ accepted: true }),
  });
  assert.equal((await adapter.dispatch(plan)).status, "unsupported");
});

testCase("both dispatch results preserve subject, request and pipeline identity", async () => {
  const adapter = new VfxrCharacterPoseAdapter({
    targetId: "vfxr", supportsPoseKind: () => true,
    submitPoseAuthoringRequest: () => ({ accepted: true }),
  });
  const outcome = await adapter.dispatch(plan);
  assert.equal(outcome.requestId, plan.requestId);
  assert.equal(outcome.subjectId, plan.subjectId);
  assert.equal(outcome.pipeline, "VFXR");
});
