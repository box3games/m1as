import * as THREE from "three";
import type { Measurement } from "./contracts.js";
import {
  measureExperientialScale,
  resolveExperientialScaleProfiles,
  type ExperientialScaleProfileSet,
  type ExperientialScaleSnapshot,
} from "../growth/experiential-scale.js";

export interface ExperientialScaleCaptureOptions {
  subjectId: string;
  root: THREE.Object3D;
  camera: THREE.Camera;
  viewportWidth: number;
  viewportHeight: number;
  worldUnit: string;
  stageId: string;
  cameraMode: string;
  profiles?: ExperientialScaleProfileSet | null;
}

/** Captures independent scale dimensions and their configured presentation mappings. */
export function captureExperientialScale(
  options: ExperientialScaleCaptureOptions,
): Measurement<ExperientialScaleSnapshot> {
  const { root, camera, viewportWidth, viewportHeight, worldUnit, stageId, cameraMode, profiles } = options;
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0 ||
      !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return { status: "failed", reason: "Viewport dimensions must be finite and positive." };
  }
  root.updateWorldMatrix(true, true);
  camera.updateWorldMatrix(true, false);
  const worldBounds = new THREE.Box3().setFromObject(root);
  if (worldBounds.isEmpty()) {
    return { status: "not_captured", reason: "Subject has no measurable world-space geometry bounds." };
  }
  const size = worldBounds.getSize(new THREE.Vector3());
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
    return { status: "failed", reason: "Subject world-space dimensions must be positive on all axes." };
  }
  const projected: THREE.Vector3[] = [];
  for (const x of [worldBounds.min.x, worldBounds.max.x]) {
    for (const y of [worldBounds.min.y, worldBounds.max.y]) {
      for (const z of [worldBounds.min.z, worldBounds.max.z]) {
        projected.push(new THREE.Vector3(x, y, z).project(camera));
      }
    }
  }
  const ndc = {
    left: Math.min(...projected.map(point => point.x)),
    right: Math.max(...projected.map(point => point.x)),
    top: Math.min(...projected.map(point => point.y)),
    bottom: Math.max(...projected.map(point => point.y)),
    near: Math.min(...projected.map(point => point.z)),
    far: Math.max(...projected.map(point => point.z)),
  };
  const normalizedBounds = {
    left: (ndc.left + 1) * 0.5,
    right: (ndc.right + 1) * 0.5,
    top: (1 - ndc.bottom) * 0.5,
    bottom: (1 - ndc.top) * 0.5,
  };
  const intersectsViewport = ndc.right >= -1 && ndc.left <= 1 &&
    ndc.bottom >= -1 && ndc.top <= 1 && ndc.far >= -1 && ndc.near <= 1;
  const resolved = resolveExperientialScaleProfiles(profiles, stageId, cameraMode);
  const snapshot = measureExperientialScale({
    subject: {
      subjectId: options.subjectId,
      dimensions: { x: size.x, y: size.y, z: size.z },
      worldUnit,
    },
    stageId, cameraMode, viewportWidth, viewportHeight, normalizedBounds,
    cameraId: camera.uuid,
    projection: camera instanceof THREE.OrthographicCamera ? "orthographic" : "perspective",
    visible: root.visible && intersectsViewport,
    clipped: normalizedBounds.left < 0 || normalizedBounds.top < 0 ||
      normalizedBounds.right > 1 || normalizedBounds.bottom > 1,
    profiles: resolved,
    ...(profiles ? { profileSet: { id: profiles.id, version: profiles.version } } : {}),
  });
  return {
    status: "available",
    value: snapshot,
    provenance: "three-object3d-world-bounds-camera-projection-and-authored-profiles",
  };
}
