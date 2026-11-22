import test from "node:test";
import assert from "node:assert/strict";
import {
  computeCameraRelativeProjectedScale,
  computeStageRelativeScale,
  measureScalePerception,
  normalizePerceivedMass,
} from "./scale-perception.js";

const subject = {
  subjectId: "test-subject",
  dimensions: { x: 4, y: 2, z: 1 },
  worldUnit: "m",
};
const stage = {
  id: "lab-room",
  version: "1",
  worldUnit: "m",
  referenceDimensions: { x: 2, y: 2, z: 2 },
  referenceVolume: 8,
};

test("stage-relative scale preserves independent axis ratios and volume ratio", () => {
  const result = computeStageRelativeScale(subject, stage);
  assert.deepEqual(result.axisRatios, { x: 2, y: 1, z: 0.5 });
  assert.equal(result.geometricMeanLinearRatio, 1);
  assert.equal(result.relativeVolume3D, 1);
});

test("stage changes recompute reference ratios without mutating actual dimensions", () => {
  const before = { ...subject.dimensions };
  const first = computeStageRelativeScale(subject, stage);
  const second = computeStageRelativeScale(subject, {
    ...stage,
    id: "colossal-stage",
    referenceDimensions: { x: 20, y: 20, z: 20 },
  });
  assert.deepEqual(subject.dimensions, before);
  assert.equal(first.axisRatios.x, 2);
  assert.equal(second.axisRatios.x, 0.2);
});

test("stage normalization rejects mismatched world units", () => {
  assert.throws(
    () => computeStageRelativeScale(subject, { ...stage, worldUnit: "cm" }),
    /world units must match/,
  );
});

test("camera-relative 2D mass uses projected area and preserves offscreen bounds", () => {
  const result = computeCameraRelativeProjectedScale({
    stageId: "lab-room",
    referenceProfileId: "lab-inspection",
    referenceProfileVersion: "1",
    cameraId: "inspection-camera",
    projection: "perspective",
    viewportWidth: 1920,
    viewportHeight: 1080,
    bounds: { left: -0.1, top: 0.2, right: 0.5, bottom: 0.7 },
    referenceProjectedAreaFraction: 0.1,
    visible: true,
    clipped: true,
  });
  assert.equal(result.projectedWidthFraction, 0.6);
  assert.equal(result.projectedHeightFraction, 0.5);
  assert.equal(result.projectedAreaFraction, 0.3);
  assert.ok(Math.abs(result.relativeMass2D - 3) < 1e-12);
  assert.equal(result.normalizedBounds.left, -0.1);
  assert.equal(result.clipped, true);
});

test("camera movement can change projected mass without changing actual dimensions", () => {
  const near = computeCameraRelativeProjectedScale({
    stageId: "lab-room",
    referenceProfileId: "lab-near",
    referenceProfileVersion: "1",
    cameraId: "near",
    projection: "perspective",
    viewportWidth: 1000,
    viewportHeight: 1000,
    bounds: { left: 0.2, top: 0.2, right: 0.8, bottom: 0.8 },
    referenceProjectedAreaFraction: 0.1,
    visible: true,
    clipped: false,
  });
  const far = computeCameraRelativeProjectedScale({
    stageId: "lab-room",
    referenceProfileId: "lab-far",
    referenceProfileVersion: "1",
    cameraId: "far",
    projection: "perspective",
    viewportWidth: 1000,
    viewportHeight: 1000,
    bounds: { left: 0.4, top: 0.4, right: 0.6, bottom: 0.6 },
    referenceProjectedAreaFraction: 0.1,
    visible: true,
    clipped: false,
  });
  assert.ok(Math.abs(near.relativeMass2D - 3.6) < 1e-12);
  assert.ok(Math.abs(far.relativeMass2D - 0.4) < 1e-12);
  assert.deepEqual(subject.dimensions, { x: 4, y: 2, z: 1 });
});

test("perceived mass normalizes against its authored profile without clamping", () => {
  const normal = normalizePerceivedMass({
    stageId: "lab-room",
    id: "hologram-presence",
    version: "2",
    authoredValue: 7.5,
    authoredRange: { minimum: 0, maximum: 10 },
  });
  assert.equal(normal.normalizedValue, 0.75);
  assert.equal(normal.outOfRange, false);

  const amplified = normalizePerceivedMass({
    stageId: "lab-room",
    id: "hologram-presence",
    version: "2",
    authoredValue: 15,
    authoredRange: { minimum: 0, maximum: 10 },
  });
  assert.equal(amplified.normalizedValue, 1.5);
  assert.equal(amplified.outOfRange, true);
});

test("perceived mass remains independent from physical scale and projected area", () => {
  const low = normalizePerceivedMass({
    stageId: "lab-room",
    id: "presence",
    version: "1",
    authoredValue: 1,
    authoredRange: { minimum: 0, maximum: 10 },
  });
  const high = normalizePerceivedMass({
    stageId: "lab-room",
    id: "presence",
    version: "1",
    authoredValue: 9,
    authoredRange: { minimum: 0, maximum: 10 },
  });
  assert.notEqual(low.normalizedValue, high.normalizedValue);
  assert.deepEqual(subject.dimensions, { x: 4, y: 2, z: 1 });
});

test("combined measurement snapshot keeps the four measurements distinct", () => {
  const result = measureScalePerception({
    subject,
    stageProfile: stage,
    camera: {
      stageId: "lab-room",
      referenceProfileId: "lab-hologram-camera",
      referenceProfileVersion: "1",
      cameraId: "holo-cam",
      projection: "orthographic",
      viewportWidth: 1280,
      viewportHeight: 720,
      bounds: { left: 0.25, top: 0.1, right: 0.75, bottom: 0.9 },
      referenceProjectedAreaFraction: 0.2,
      visible: true,
      clipped: false,
    },
    perceivedMassProfile: {
      stageId: "lab-room",
      id: "colossal-hologram",
      version: "1",
      authoredValue: 20,
      authoredRange: { minimum: 0, maximum: 10 },
    },
  });
  assert.deepEqual(result.actualDimensions, subject.dimensions);
  assert.equal(result.stageRelative.relativeVolume3D, 1);
  assert.equal(result.cameraRelative.relativeMass2D, 2);
  assert.equal(result.perceivedMass.normalizedValue, 2);
  assert.equal(result.perceivedMass.outOfRange, true);
});

test("invalid camera bounds and perceived-mass ranges are rejected", () => {
  assert.throws(() => computeCameraRelativeProjectedScale({
    stageId: "lab-room",
    referenceProfileId: "bad-camera",
    referenceProfileVersion: "1",
    cameraId: "bad",
    projection: "perspective",
    viewportWidth: 100,
    viewportHeight: 100,
    bounds: { left: 0.8, top: 0, right: 0.2, bottom: 1 },
    referenceProjectedAreaFraction: 0.1,
    visible: true,
    clipped: false,
  }), /non-negative width and height/);

  assert.throws(() => normalizePerceivedMass({
    stageId: "lab-room",
    id: "bad",
    version: "1",
    authoredValue: 2,
    authoredRange: { minimum: 1, maximum: 1 },
  }), /maximum > minimum/);
});

test("combined measurements reject camera or perceived-mass references from another stage", () => {
  const camera = {
    stageId: "colossal-stage",
    referenceProfileId: "colossal-camera",
    referenceProfileVersion: "1",
    cameraId: "colossal-camera",
    projection: "perspective" as const,
    viewportWidth: 1000,
    viewportHeight: 1000,
    bounds: { left: 0.2, top: 0.2, right: 0.8, bottom: 0.8 },
    referenceProjectedAreaFraction: 0.1,
    visible: true,
    clipped: false,
  };
  assert.throws(() => measureScalePerception({
    subject,
    stageProfile: stage,
    camera,
    perceivedMassProfile: {
      stageId: "lab-room",
      id: "presence",
      version: "1",
      authoredValue: 5,
      authoredRange: { minimum: 0, maximum: 10 },
    },
  }), /must match the active stage profile/);
});
