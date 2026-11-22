import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePresentationAccents,
  measureExperientialScale,
  resolveExperientialScaleProfiles,
  validateExperientialScaleProfileSet,
  type ExperientialScaleProfileSet,
} from "../growth/experiential-scale.js";

const validProfiles: ExperientialScaleProfileSet = {
  schemaVersion: 1,
  id: "test-profiles",
  version: "1",
  stages: {
    room: {
      id: "room",
      version: "2",
      worldUnit: "m",
      referenceDimensions: { x: 10, y: 3, z: 10 },
      referenceVolume: 300,
    },
  },
  cameras: {
    inspection: {
      id: "inspection-reference",
      version: "3",
      stageId: "room",
      cameraMode: "inspection",
      referenceProjectedAreaFraction: 0.12,
    },
  },
  perceivedMass: {
    room: {
      stageId: "room",
      id: "presence",
      version: "4",
      authoredValue: 12,
      authoredRange: { minimum: 0, maximum: 10 },
    },
  },
  presentationAccent: {
    id: "dramatic-presence",
    version: "1",
    channels: [{
      id: "presence-light",
      enabled: true,
      source: "perceived_mass",
      inputRange: { minimum: 0, maximum: 1 },
      outputRange: { minimum: 0.2, maximum: 1.5 },
      curve: "smoothstep",
    }],
  },
};

test("profile validation accepts authored profiles and rejects invalid ranges", () => {
  assert.doesNotThrow(() => validateExperientialScaleProfileSet(validProfiles));
  const invalid = structuredClone(validProfiles);
  invalid.stages.room.referenceDimensions.x = 0;
  assert.throws(() => validateExperientialScaleProfileSet(invalid), /must be positive/);
});

test("profile resolution keeps stage and camera-mode references independent", () => {
  const resolved = resolveExperientialScaleProfiles(validProfiles, "room", "inspection");
  assert.equal(resolved.stage?.version, "2");
  assert.equal(resolved.camera?.version, "3");
  assert.equal(resolved.perceivedMass?.version, "4");
  const wrongMode = resolveExperientialScaleProfiles(validProfiles, "room", "cinematic");
  assert.equal(wrongMode.camera, undefined);
  assert.ok(wrongMode.stage);
});

test("measurements remain distinct and perceived mass preserves out-of-range authored values", () => {
  const resolved = resolveExperientialScaleProfiles(validProfiles, "room", "inspection");
  const snapshot = measureExperientialScale({
    subject: {
      subjectId: "subject",
      dimensions: { x: 4, y: 5, z: 2 },
      worldUnit: "m",
    },
    stageId: "room",
    cameraMode: "inspection",
    viewportWidth: 1920,
    viewportHeight: 1080,
    normalizedBounds: { left: 0.2, top: 0.1, right: 0.8, bottom: 0.9 },
    cameraId: "camera-1",
    projection: "perspective",
    visible: true,
    clipped: false,
    profiles: resolved,
    profileSet: { id: validProfiles.id, version: validProfiles.version },
  });
  assert.equal(snapshot.actualScale.status, "available");
  assert.equal(snapshot.actualScale.dimensions?.x, 4);
  assert.equal(snapshot.stageRelative.status, "available");
  assert.equal(snapshot.cameraRelative.status, "available");
  assert.equal(snapshot.perceivedMass.status, "available");
  if (snapshot.perceivedMass.status === "available") {
    assert.equal(snapshot.perceivedMass.value.normalizedValue, 1.2);
    assert.equal(snapshot.perceivedMass.value.outOfRange, true);
  }
  assert.equal(snapshot.presentationAccent.status, "available");
  if (snapshot.presentationAccent.status === "available") {
    assert.equal(snapshot.presentationAccent.value.channels[0].mappedTargetValue, 1.5);
    assert.equal(snapshot.presentationAccent.value.channels[0].appliedValue.status, "not_captured");
  }
});

test("actual dimensions remain available when authored profiles are absent", () => {
  const snapshot = measureExperientialScale({
    subject: { subjectId: "subject", dimensions: { x: 1, y: 2, z: 3 }, worldUnit: "m" },
    stageId: "unconfigured-stage",
    cameraMode: "inspection",
    viewportWidth: 800,
    viewportHeight: 600,
    normalizedBounds: { left: 0, top: 0, right: 1, bottom: 1 },
    cameraId: "camera-1",
    projection: "orthographic",
    visible: true,
    clipped: false,
    profiles: {},
  });
  assert.equal(snapshot.actualScale.status, "available");
  assert.equal(snapshot.stageRelative.status, "not_captured");
  assert.equal(snapshot.cameraRelative.status, "not_captured");
  assert.equal(snapshot.perceivedMass.status, "not_captured");
  assert.equal(snapshot.presentationAccent.status, "not_captured");
});

test("accent evaluation supports unclamped authored extrapolation", () => {
  const result = evaluatePresentationAccents(
    { perceived_mass: 1.5 },
    {
      id: "extrapolate",
      version: "1",
      channels: [{
        id: "effect",
        enabled: true,
        source: "perceived_mass",
        inputRange: { minimum: 0, maximum: 1 },
        outputRange: { minimum: 0, maximum: 2 },
        curve: "linear",
        clampInput: false,
      }],
    },
  );
  assert.equal(result.channels[0].mappedTargetValue, 3);
});
