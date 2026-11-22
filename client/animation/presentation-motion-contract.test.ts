import test from "node:test";
import assert from "node:assert/strict";
import {
  CHARACTER_PRESENTATION_MOTION_SCHEMA_VERSION,
  resolveCharacterMotionIntents,
  validateCharacterPresentationMotionProfile,
  type CharacterPresentationMotionProfile,
  type MotionIntent,
  type MotionResolutionContext,
} from "./presentation-motion-contract.js";

const profile: CharacterPresentationMotionProfile = {
  schemaVersion: CHARACTER_PRESENTATION_MOTION_SCHEMA_VERSION,
  id: "test-motion",
  version: "1",
  layers: [
    {
      id: "breath", enabled: true, asset: { kind: "script", id: "breath-script" },
      regions: ["chest", "shoulders"], mode: "additive", priority: 20, weight: 0.4,
      blendInSeconds: 0.2, blendOutSeconds: 0.3, interruption: "when_higher_priority",
      sourceChannels: ["breathExpansion", "internalPressure"],
    },
    {
      id: "posture-override", enabled: true, asset: { kind: "clip", id: "hunch" },
      regions: ["spine"], mode: "replace", priority: 100, weight: 1,
      blendInSeconds: 0.2, blendOutSeconds: 0.2, interruption: "never",
      allowPostureOverride: true, sourceChannels: ["perceivedMass"],
    },
    {
      id: "unsupported", enabled: true, asset: { kind: "clip", id: "missing" },
      regions: ["head"], mode: "overlay", priority: 5, weight: 0.5,
      blendInSeconds: 0, blendOutSeconds: 0, interruption: "never", sourceChannels: [],
    },
  ],
};

const snapshot: MotionIntent["sourceSnapshot"] = {
  simulationTimeSeconds: 1,
  actualScale: { status: "available", value: 2, unit: "ratio", provenance: "test" },
  stageRelativeScale: { status: "available", value: 1.5, unit: "ratio", provenance: "test" },
  cameraRelativeProjectedScale: { status: "available", value: 0.8, unit: "ratio", provenance: "test" },
  perceivedMass: { status: "available", value: 0.9, unit: "normalized", provenance: "authored-test" },
  growthVelocity: { status: "available", value: 0.2, unit: "world_units_per_second", provenance: "test" },
  breathPhase: "inhale",
  breathExpansion: { status: "available", value: 0.4, unit: "normalized", provenance: "test" },
  internalPressure: { status: "available", value: 0.7, unit: "normalized", provenance: "test" },
  pressureWave: { status: "not_captured", reason: "not supplied" },
};

const context: MotionResolutionContext = {
  subjectId: "subject-1", posture: "hunch",
  rig: {
    rigId: "rig-1", rigVersion: "1", adapterKind: "skeletal_glb",
    supportedRegions: ["chest", "shoulders", "spine", "head"],
    supportedLayerModes: ["additive", "overlay", "replace"],
    postureControlledRegions: ["spine"], postureOverrideAllowed: false,
    supportsJointConstraints: true, supportsPerRegionTelemetry: true,
    availableClipIds: ["hunch"], availableScriptIds: ["breath-script"],
  },
};

test("motion profile validation rejects duplicate IDs and invalid weights", () => {
  assert.deepEqual(validateCharacterPresentationMotionProfile(profile), []);
  const invalid = { ...profile, layers: [...profile.layers, { ...profile.layers[0] }, { ...profile.layers[0], id: "bad", weight: 1.5 }] };
  assert.ok(validateCharacterPresentationMotionProfile(invalid).some(issue => issue.includes("duplicates")));
  assert.ok(validateCharacterPresentationMotionProfile(invalid).some(issue => issue.includes("weight")));
});

test("additive breath cue is accepted without owning posture-controlled spine", () => {
  const intent: MotionIntent = { intentId: "i1", layerId: "breath", subjectId: "subject-1", simulationTimeSeconds: 1, sourceSnapshot: snapshot };
  const [result] = resolveCharacterMotionIntents(profile, [intent], context);
  assert.equal(result.status, "accepted");
  assert.equal(result.resolvedWeight, 0.4);
  assert.deepEqual(result.regions, ["chest", "shoulders"]);
});

test("posture-controlled regions cannot be replaced without explicit rig permission", () => {
  const intent: MotionIntent = { intentId: "i2", layerId: "posture-override", subjectId: "subject-1", simulationTimeSeconds: 1, sourceSnapshot: snapshot };
  const [result] = resolveCharacterMotionIntents(profile, [intent], context);
  assert.equal(result.status, "rejected");
  assert.match(result.reason ?? "", /Posture authority/);
});

test("missing clip/script capabilities are reported rather than silently substituted", () => {
  const intent: MotionIntent = { intentId: "i3", layerId: "unsupported", subjectId: "subject-1", simulationTimeSeconds: 1, sourceSnapshot: snapshot };
  const [result] = resolveCharacterMotionIntents(profile, [intent], context);
  assert.equal(result.status, "rejected");
  assert.match(result.reason ?? "", /does not expose/);
});

test("replace-layer conflicts are deterministic and do not attenuate accepted weights", () => {
  const conflictingProfile: CharacterPresentationMotionProfile = {
    ...profile,
    layers: [
      { ...profile.layers[0], id: "replace-a", mode: "replace", regions: ["head"], priority: 10, asset: { kind: "clip", id: "hunch" } },
      { ...profile.layers[0], id: "replace-b", mode: "replace", regions: ["head"], priority: 5, asset: { kind: "clip", id: "hunch" } },
    ],
  };
  const intents = ["replace-b", "replace-a"].map(layerId => ({
    intentId: layerId, layerId, subjectId: "subject-1", simulationTimeSeconds: 1, sourceSnapshot: snapshot,
  }));
  const results = resolveCharacterMotionIntents(conflictingProfile, intents, context);
  assert.equal(results[0].status, "rejected");
  assert.equal(results[1].status, "accepted");
  assert.equal(results[1].resolvedWeight, 0.4);
  assert.match(results[0].reason ?? "", /higher-priority/);
});
