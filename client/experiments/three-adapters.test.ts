import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { captureCharacterPresentation } from "./three-adapters.js";

test("projected screen bounds preserve offscreen extent while occupancy remains clipped", () => {
  const root = new THREE.Group();
  root.position.set(4.5, 0, -5);
  root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial()));
  root.updateMatrixWorld(true);

  const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const sample = captureCharacterPresentation(root, camera, "m");
  assert.equal(sample.screenBounds.status, "available");
  assert.equal(sample.screenOccupancy.status, "available");
  if (sample.screenBounds.status !== "available" || sample.screenOccupancy.status !== "available") {
    throw new Error("Expected projected bounds and occupancy to be available.");
  }
  assert.ok(sample.screenBounds.value.max.x > 1);
  assert.ok(sample.screenBounds.value.min.x < 1);
  assert.ok(sample.screenOccupancy.value > 0);
  const fullProjectedArea =
    (sample.screenBounds.value.max.x - sample.screenBounds.value.min.x) *
    (sample.screenBounds.value.max.y - sample.screenBounds.value.min.y);
  assert.ok(sample.screenOccupancy.value < fullProjectedArea);
});
