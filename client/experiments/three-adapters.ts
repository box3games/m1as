import * as THREE from 'three';
import type {
  Bounds2, Bounds3, CameraRuntimeState, CameraViewport, CharacterPresentationSample,
  Euler3, Measurement, Transform3, WorldLandmarkSample,
} from './contracts.js';

const unavailable = <T>(reason: string): Measurement<T> => ({ status: 'not_captured', reason });
const measured = <T>(value: T, unit?: string): Measurement<T> => ({
  status: 'available', value, unit, provenance: 'measured',
});

function localTransform(object: THREE.Object3D): Transform3 {
  return {
    position: { x: object.position.x, y: object.position.y, z: object.position.z },
    rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z, unit: 'radians' },
    scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
    coordinateSpace: 'local',
  };
}

function worldTransform(object: THREE.Object3D): Transform3 {
  object.updateWorldMatrix(true, false);
  const position = object.getWorldPosition(new THREE.Vector3());
  const quaternion = object.getWorldQuaternion(new THREE.Quaternion());
  const scale = object.getWorldScale(new THREE.Vector3());
  const rotation = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
  return {
    position: { x: position.x, y: position.y, z: position.z },
    rotation: { x: rotation.x, y: rotation.y, z: rotation.z, unit: 'radians' },
    scale: { x: scale.x, y: scale.y, z: scale.z },
    coordinateSpace: 'world',
  };
}

function hierarchyVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function worldBounds(object: THREE.Object3D, worldUnit: string): Bounds3 | null {
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return null;
  return {
    min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
    max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
    coordinateSpace: 'world',
    unit: worldUnit,
  };
}

function projectBounds(bounds: Bounds3, camera: THREE.Camera): {
  bounds: Bounds2; occupancy: number; intersectsViewport: boolean;
} {
  const corners = [
    [bounds.min.x, bounds.min.y, bounds.min.z], [bounds.min.x, bounds.min.y, bounds.max.z],
    [bounds.min.x, bounds.max.y, bounds.min.z], [bounds.min.x, bounds.max.y, bounds.max.z],
    [bounds.max.x, bounds.min.y, bounds.min.z], [bounds.max.x, bounds.min.y, bounds.max.z],
    [bounds.max.x, bounds.max.y, bounds.min.z], [bounds.max.x, bounds.max.y, bounds.max.z],
  ];
  const projected = corners.map(([x, y, z]) => new THREE.Vector3(x, y, z).project(camera));
  const minX = Math.min(...projected.map(p => p.x));
  const maxX = Math.max(...projected.map(p => p.x));
  const minY = Math.min(...projected.map(p => p.y));
  const maxY = Math.max(...projected.map(p => p.y));
  const minZ = Math.min(...projected.map(p => p.z));
  const maxZ = Math.max(...projected.map(p => p.z));
  // Preserve the full projected footprint, including offscreen bounds. Clipping
  // is applied only to visible occupancy so representation prediction can see
  // a subject growing beyond the viewport instead of reading a false zero-size box.
  const left = (minX + 1) * 0.5;
  const right = (maxX + 1) * 0.5;
  const top = (1 - maxY) * 0.5;
  const bottom = (1 - minY) * 0.5;
  const intersectsViewport = maxX >= -1 && minX <= 1 && maxY >= -1 && minY <= 1 && maxZ >= -1 && minZ <= 1;
  const clippedLeft = Math.max(0, left);
  const clippedRight = Math.min(1, right);
  const clippedTop = Math.max(0, top);
  const clippedBottom = Math.min(1, bottom);
  const width = intersectsViewport ? Math.max(0, clippedRight - clippedLeft) : 0;
  const height = intersectsViewport ? Math.max(0, clippedBottom - clippedTop) : 0;
  return {
    bounds: { min: { x: left, y: top }, max: { x: right, y: bottom }, coordinateSpace: 'screen' },
    occupancy: width * height,
    intersectsViewport,
  };
}

/** Read-only adapter for the current PerspectiveCamera engine contract. */
export function capturePerspectiveCamera(
  camera: THREE.PerspectiveCamera,
  viewport: CameraViewport,
  options: { target?: THREE.Vector3; cameraMode?: string } = {},
): Measurement<CameraRuntimeState> {
  if (viewport.widthPixels <= 0 || viewport.heightPixels <= 0) {
    return { status: 'failed', reason: 'Camera viewport dimensions must be positive.' };
  }
  return measured({
    projection: {
      projection: 'perspective',
      fovRadians: THREE.MathUtils.degToRad(camera.fov),
      nearPlane: camera.near,
      farPlane: camera.far,
    },
    transform: worldTransform(camera),
    target: options.target ? {
      x: options.target.x, y: options.target.y, z: options.target.z,
    } : undefined,
    viewport: { ...viewport, aspectRatio: camera.aspect },
    cameraMode: options.cameraMode,
  });
}

/** Captures baseline character presentation metrics without changing scene transforms. */
export function captureCharacterPresentation(
  root: THREE.Object3D,
  camera: THREE.Camera,
  worldUnit: string,
): CharacterPresentationSample {
  const bounds = worldBounds(root, worldUnit);
  if (!bounds) {
    const worldPose = worldTransform(root);
    return {
      rootTransform: measured(localTransform(root)),
      worldBounds: unavailable('The character has no measurable geometry bounds.'),
      screenBounds: unavailable('Screen bounds require measurable character geometry.'),
      screenOccupancy: unavailable('Screen occupancy requires measurable character geometry.'),
      posture: unavailable('Posture is not exposed by the generic Object3D adapter.'),
      orientation: measured(worldPose.rotation as Euler3),
      visible: measured(false),
      regions: [],
    };
  }
  camera.updateWorldMatrix(true, false);
  const screen = projectBounds(bounds, camera);
  const worldPose = worldTransform(root);
  const euler = worldPose.rotation as Euler3;
  return {
    rootTransform: measured(localTransform(root)),
    worldBounds: measured(bounds, worldUnit),
    screenBounds: measured(screen.bounds),
    screenOccupancy: measured(screen.occupancy, 'viewport_fraction'),
    posture: unavailable('Posture is not exposed by the generic Object3D adapter.'),
    orientation: measured(euler),
    visible: measured(hierarchyVisible(root) && screen.intersectsViewport),
    regions: [],
  };
}

/** Captures a registered environment landmark using the same world/screen convention. */
export function captureWorldLandmark(
  landmarkId: string,
  kind: string,
  object: THREE.Object3D,
  camera: THREE.Camera,
  worldUnit: string,
): WorldLandmarkSample {
  const bounds = worldBounds(object, worldUnit);
  if (!bounds) {
    return {
      landmarkId, kind,
      worldTransform: measured(worldTransform(object)),
      worldBounds: unavailable('Landmark has no measurable geometry bounds.'),
      screenBounds: unavailable('Screen bounds require measurable landmark geometry.'),
      visible: measured(false),
    };
  }
  camera.updateWorldMatrix(true, false);
  const screen = projectBounds(bounds, camera);
  return {
    landmarkId,
    kind,
    worldTransform: measured(worldTransform(object)),
    worldBounds: measured(bounds, worldUnit),
    screenBounds: measured(screen.bounds),
    visible: measured(hierarchyVisible(object) && screen.intersectsViewport),
  };
}
