import * as THREE from "three";
import {
  measureScalePerception,
  type PerceivedMassProfile,
  type ScalePerceptionMeasurements,
  type StageScaleReferenceProfile,
} from "../growth/scale-perception.js";
import type { Measurement } from "./contracts.js";

export interface ScalePerceptionCaptureOptions {
  subjectId: string;
  root: THREE.Object3D;
  camera: THREE.Camera;
  viewportWidth: number;
  viewportHeight: number;
  worldUnit: string;
  stageProfile: StageScaleReferenceProfile;
  cameraReference: {
    id: string;
    version: string;
    referenceProjectedAreaFraction: number;
  };
  perceivedMassProfile: PerceivedMassProfile;
}

/**
 * Read-only bridge from the live Three.js subject/camera into the shared
 * scale-perception measurements. Full projected bounds are retained outside
 * the viewport; actual dimensions are measured in world units and are never
 * changed by this adapter.
 */
export function captureScalePerception(
  options: ScalePerceptionCaptureOptions,
): Measurement<ScalePerceptionMeasurements> {
  const {
    subjectId, root, camera, viewportWidth, viewportHeight, worldUnit,
    stageProfile, cameraReference, perceivedMassProfile,
  } = options;

  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0 ||
      !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return { status: "failed", reason: "Viewport dimensions must be finite and positive." };
  }
  if (stageProfile.worldUnit !== worldUnit) {
    return { status: "failed", reason: "Subject and stage reference world units must match." };
  }

  root.updateWorldMatrix(true, true);
  camera.updateWorldMatrix(true, false);
  if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
    camera.updateProjectionMatrix();
  }

  const worldBounds = new THREE.Box3().setFromObject(root);
  if (worldBounds.isEmpty()) {
    return { status: "not_captured", reason: "Subject has no measurable world-space geometry bounds." };
  }

  const size = worldBounds.getSize(new THREE.Vector3());
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
    return { status: "failed", reason: "Subject world-space dimensions must be positive on all axes." };
  }

  const corners: THREE.Vector3[] = [];
  for (const x of [worldBounds.min.x, worldBounds.max.x]) {
    for (const y of [worldBounds.min.y, worldBounds.max.y]) {
      for (const z of [worldBounds.min.z, worldBounds.max.z]) {
        corners.push(new THREE.Vector3(x, y, z).project(camera));
      }
    }
  }
  const ndc = {
    left: Math.min(...corners.map(point => point.x)),
    right: Math.max(...corners.map(point => point.x)),
    top: Math.min(...corners.map(point => point.y)),
    bottom: Math.max(...corners.map(point => point.y)),
  };
  const bounds = {
    left: (ndc.left + 1) * 0.5,
    right: (ndc.right + 1) * 0.5,
    top: (1 - ndc.bottom) * 0.5,
    bottom: (1 - ndc.top) * 0.5,
  };
  const intersectsViewport = ndc.right >= -1 && ndc.left <= 1 &&
    ndc.bottom >= -1 && ndc.top <= 1 &&
    Math.max(...corners.map(point => point.z)) >= -1 &&
    Math.min(...corners.map(point => point.z)) <= 1;

  try {
    const measurements = measureScalePerception({
      subject: {
        subjectId,
        dimensions: { x: size.x, y: size.y, z: size.z },
        worldUnit,
      },
      stageProfile,
      camera: {
        stageId: stageProfile.id,
        referenceProfileId: cameraReference.id,
        referenceProfileVersion: cameraReference.version,
        cameraId: camera.uuid,
        projection: camera instanceof THREE.OrthographicCamera ? "orthographic" : "perspective",
        viewportWidth,
        viewportHeight,
        bounds,
        referenceProjectedAreaFraction: cameraReference.referenceProjectedAreaFraction,
        visible: root.visible && intersectsViewport,
        clipped: bounds.left < 0 || bounds.top < 0 || bounds.right > 1 || bounds.bottom > 1,
      },
      perceivedMassProfile,
    });
    return { status: "available", value: measurements, provenance: "three-object3d-world-bounds-and-camera-projection" };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "Scale-perception measurement failed.",
    };
  }
}
