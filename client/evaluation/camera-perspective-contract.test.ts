import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCameraAttachmentConfiguration,
  validateCameraPerspectiveSnapshot,
  validateSynchronizedPerspectiveCapture,
  type CameraPerspectiveSnapshot,
} from "./camera-perspective-contract.js";

const attachment = {
  attachmentId: "sticky:shoulder-cam",
  target: {
    anchorId: "rig-bone:LeftShoulder",
    ownerId: "subject-growing",
    coordinateSpace: "subject-local" as const,
    source: "big3r-glb-skeleton",
    sourceVersion: "1.0.0",
  },
  behavior: "soft-stick" as const,
  localPosition: { x: -0.2, y: 0.15, z: 0.45 },
  localRotation: { x: 0, y: 0, z: 0 },
  dampingSeconds: 0.18,
};

function perspective(overrides: Partial<CameraPerspectiveSnapshot> = {}): CameraPerspectiveSnapshot {
  return {
    schemaVersion: "big3r-camera-perspective/1.0",
    perspectiveId: "observer-low",
    cameraId: "camera-1",
    kind: "low-angle",
    viewpointSubjectId: "observer-1",
    observedSubjectId: "subject-growing",
    simulationTimeSeconds: 12.5,
    configurationVersion: "recipe-v1",
    growthStateId: "growth-sample-0042",
    cameraPosition: { x: 0, y: 1.5, z: 5 },
    cameraRotation: { x: 0, y: 0, z: 0 },
    projection: {
      fovDegrees: 55,
      aspectRatio: 16 / 9,
      nearPlane: 0.05,
      farPlane: 10000,
      viewportWidth: 1920,
      viewportHeight: 1080,
    },
    framingIntent: "full-body",
    ...overrides,
  };
}

test("sticky camera attachment validates stable anchor identity and local pose", () => {
  assert.doesNotThrow(() => validateCameraAttachmentConfiguration(attachment));
});

test("look-at-stick requires an independent look-at anchor", () => {
  assert.throws(() => validateCameraAttachmentConfiguration({
    ...attachment,
    behavior: "look-at-stick",
  }), /requires an independent lookAtTarget/);
});

test("camera perspective snapshot validates projection and viewpoint metadata", () => {
  assert.doesNotThrow(() => validateCameraPerspectiveSnapshot(perspective({
    kind: "over-shoulder",
    attachment,
  })));
  assert.throws(() => validateCameraPerspectiveSnapshot(perspective({
    projection: { ...perspective().projection, farPlane: 0.01 },
  })), /projection and viewport values are invalid/);
});

test("paired perspectives must capture the same growth event and simulation time", () => {
  const capture = {
    schemaVersion: "big3r-synchronized-perspectives/1.0" as const,
    captureId: "paired-event-1",
    observedSubjectId: "subject-growing",
    simulationTimeSeconds: 12.5,
    configurationVersion: "recipe-v1",
    growthStateId: "growth-sample-0042",
    perspectives: [
      perspective({ perspectiveId: "child-view", kind: "first-person", viewpointSubjectId: "child-1" }),
      perspective({ perspectiveId: "adult-view", kind: "looking-down", viewpointSubjectId: "adult-1" }),
      perspective({ perspectiveId: "shoulder-view", kind: "over-shoulder", attachment }),
    ],
  };
  assert.doesNotThrow(() => validateSynchronizedPerspectiveCapture(capture));
  assert.throws(() => validateSynchronizedPerspectiveCapture({
    ...capture,
    perspectives: [
      capture.perspectives[0],
      perspective({ perspectiveId: "late-view", simulationTimeSeconds: 12.6 }),
    ],
  }), /same subject, configuration, growth state, and simulation time/);
});

test("paired perspective capture requires unique perspective IDs", () => {
  const base = perspective();
  assert.throws(() => validateSynchronizedPerspectiveCapture({
    schemaVersion: "big3r-synchronized-perspectives/1.0",
    captureId: "duplicate-ids",
    observedSubjectId: "subject-growing",
    simulationTimeSeconds: 12.5,
    configurationVersion: "recipe-v1",
    growthStateId: "growth-sample-0042",
    perspectives: [base, { ...base, cameraId: "camera-2" }],
  }), /Duplicate perspectiveId/);
});

test("camera attachments accept sprite, plane, and viewport coordinate spaces", () => {
  for (const coordinateSpace of ["sprite-local", "plane-local", "viewport-normalized"] as const) {
    assert.doesNotThrow(() => validateCameraAttachmentConfiguration({
      ...attachment,
      target: { ...attachment.target, coordinateSpace },
    }));
  }
});
