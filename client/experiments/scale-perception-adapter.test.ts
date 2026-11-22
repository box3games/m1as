import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { captureScalePerception } from "./scale-perception-adapter.js";

function fixture() {
  const root = new THREE.Mesh(
    new THREE.BoxGeometry(2, 4, 1),
    new THREE.MeshBasicMaterial(),
  );
  root.position.z = -5;
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
  camera.updateProjectionMatrix();
  const stageProfile = {
    id: "room-stage",
    version: "1",
    worldUnit: "m",
    referenceDimensions: { x: 2, y: 2, z: 2 },
    referenceVolume: 8,
  };
  const perceivedMassProfile = {
    stageId: "room-stage",
    id: "presence",
    version: "1",
    authoredValue: 8,
    authoredRange: { minimum: 0, maximum: 10 },
  };
  return {
    root, camera, stageProfile, perceivedMassProfile,
    cameraReference: { id: "inspection", version: "1", referenceProjectedAreaFraction: 0.1 },
  };
}

test("live Three.js adapter measures world dimensions and camera projection without mutation", () => {
  const f = fixture();
  const before = f.root.position.clone();
  const result = captureScalePerception({
    subjectId: "box",
    root: f.root,
    camera: f.camera,
    viewportWidth: 1920,
    viewportHeight: 1080,
    worldUnit: "m",
    stageProfile: f.stageProfile,
    cameraReference: f.cameraReference,
    perceivedMassProfile: f.perceivedMassProfile,
  });
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.equal(result.value.actualDimensions.x, 2);
  assert.equal(result.value.actualDimensions.y, 4);
  assert.equal(result.value.actualDimensions.z, 1);
  assert.ok(result.value.cameraRelative.relativeMass2D > 0);
  assert.equal(result.value.perceivedMass.normalizedValue, 0.8);
  assert.deepEqual(f.root.position.toArray(), before.toArray());
});

test("live adapter reports missing geometry and mismatched units explicitly", () => {
  const f = fixture();
  const empty = new THREE.Group();
  const missing = captureScalePerception({
    subjectId: "empty",
    root: empty,
    camera: f.camera,
    viewportWidth: 1000,
    viewportHeight: 1000,
    worldUnit: "m",
    stageProfile: f.stageProfile,
    cameraReference: f.cameraReference,
    perceivedMassProfile: f.perceivedMassProfile,
  });
  assert.equal(missing.status, "not_captured");

  const mismatch = captureScalePerception({
    subjectId: "box",
    root: f.root,
    camera: f.camera,
    viewportWidth: 1000,
    viewportHeight: 1000,
    worldUnit: "cm",
    stageProfile: f.stageProfile,
    cameraReference: f.cameraReference,
    perceivedMassProfile: f.perceivedMassProfile,
  });
  assert.equal(mismatch.status, "failed");
});
