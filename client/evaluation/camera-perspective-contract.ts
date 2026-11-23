/**
 * Camera perspective, attachment, and synchronized observation contracts.
 *
 * These types describe camera intent and captured state without owning a
 * renderer or changing the authority of growth, actual scale, or stage scale.
 */

export type CameraAttachmentBehavior = "hard-stick" | "soft-stick" | "look-at-stick";

export type CameraPerspectiveKind =
  | "first-person"
  | "observer"
  | "over-shoulder"
  | "growing-toward-viewer"
  | "outstretched-hand"
  | "looking-down"
  | "elevated"
  | "low-angle"
  | "front"
  | "back"
  | "side-profile"
  | "top-down"
  | "free-form"
  | "sticky";

export type CameraFramingIntent = "full-body" | "dramatic-crop" | "environment-context" | "free";

export interface CameraVector3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraAttachmentTarget {
  /** Stable portable anchor identity; never a transient Object3D reference. */
  anchorId: string;
  ownerId: string;
  coordinateSpace: "subject-local" | "stage-world";
  source: string;
  sourceVersion: string;
}

export interface CameraAttachmentConfiguration {
  attachmentId: string;
  target: CameraAttachmentTarget;
  behavior: CameraAttachmentBehavior;
  /** Position offset in the declared target coordinate space. */
  localPosition: CameraVector3;
  /** Euler rotation offset in radians. */
  localRotation: CameraVector3;
  /** Required for look-at-stick; identifies the independent look-at anchor. */
  lookAtTarget?: CameraAttachmentTarget;
  /** Soft-stick response time in seconds. Zero means immediate following. */
  dampingSeconds: number;
}

export interface CameraProjectionSnapshot {
  fovDegrees: number;
  aspectRatio: number;
  nearPlane: number;
  farPlane: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface CameraPerspectiveSnapshot {
  schemaVersion: "big3r-camera-perspective/1.0";
  perspectiveId: string;
  cameraId: string;
  kind: CameraPerspectiveKind;
  /** The subject from whose viewpoint the camera is observing, if applicable. */
  viewpointSubjectId?: string;
  /** The subject whose growth is being observed. */
  observedSubjectId: string;
  simulationTimeSeconds: number;
  configurationVersion: string;
  /** Stable identifier for the exact growth-state sample being compared. */
  growthStateId: string;
  cameraPosition: CameraVector3;
  /** World-space Euler rotation in radians. */
  cameraRotation: CameraVector3;
  projection: CameraProjectionSnapshot;
  framingIntent: CameraFramingIntent;
  attachment?: CameraAttachmentConfiguration;
}

export interface SynchronizedPerspectiveCapture {
  schemaVersion: "big3r-synchronized-perspectives/1.0";
  captureId: string;
  observedSubjectId: string;
  simulationTimeSeconds: number;
  configurationVersion: string;
  growthStateId: string;
  perspectives: CameraPerspectiveSnapshot[];
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function assertFiniteVector(value: CameraVector3, label: string): void {
  if (!value || typeof value !== "object") throw new TypeError(`${label} is required.`);
  for (const axis of ["x", "y", "z"] as const) {
    if (!Number.isFinite(value[axis])) {
      throw new RangeError(`${label}.${axis} must be finite.`);
    }
  }
}

function validateAttachmentTarget(target: CameraAttachmentTarget, label: string): void {
  assertNonEmpty(target.anchorId, `${label}.anchorId`);
  assertNonEmpty(target.ownerId, `${label}.ownerId`);
  assertNonEmpty(target.source, `${label}.source`);
  assertNonEmpty(target.sourceVersion, `${label}.sourceVersion`);
  if (target.coordinateSpace !== "subject-local" && target.coordinateSpace !== "stage-world") {
    throw new TypeError(`${label}.coordinateSpace is unsupported.`);
  }
}

export function validateCameraAttachmentConfiguration(
  attachment: CameraAttachmentConfiguration,
): void {
  assertNonEmpty(attachment.attachmentId, "attachment.attachmentId");
  validateAttachmentTarget(attachment.target, "attachment.target");
  assertFiniteVector(attachment.localPosition, "attachment.localPosition");
  assertFiniteVector(attachment.localRotation, "attachment.localRotation");
  if (!["hard-stick", "soft-stick", "look-at-stick"].includes(attachment.behavior)) {
    throw new TypeError("attachment.behavior is unsupported.");
  }
  if (!Number.isFinite(attachment.dampingSeconds) || attachment.dampingSeconds < 0) {
    throw new RangeError("attachment.dampingSeconds must be finite and non-negative.");
  }
  if (attachment.behavior === "look-at-stick") {
    if (!attachment.lookAtTarget) {
      throw new TypeError("look-at-stick requires an independent lookAtTarget anchor.");
    }
    validateAttachmentTarget(attachment.lookAtTarget, "attachment.lookAtTarget");
  }
}

export function validateCameraPerspectiveSnapshot(snapshot: CameraPerspectiveSnapshot): void {
  if (snapshot.schemaVersion !== "big3r-camera-perspective/1.0") {
    throw new TypeError("Camera perspective snapshot has an unsupported schema version.");
  }
  assertNonEmpty(snapshot.perspectiveId, "perspectiveId");
  assertNonEmpty(snapshot.cameraId, "cameraId");
  assertNonEmpty(snapshot.observedSubjectId, "observedSubjectId");
  assertNonEmpty(snapshot.configurationVersion, "configurationVersion");
  assertNonEmpty(snapshot.growthStateId, "growthStateId");
  if (snapshot.viewpointSubjectId !== undefined) {
    assertNonEmpty(snapshot.viewpointSubjectId, "viewpointSubjectId");
  }
  if (!Number.isFinite(snapshot.simulationTimeSeconds) || snapshot.simulationTimeSeconds < 0) {
    throw new RangeError("simulationTimeSeconds must be finite and non-negative.");
  }
  assertFiniteVector(snapshot.cameraPosition, "cameraPosition");
  assertFiniteVector(snapshot.cameraRotation, "cameraRotation");
  const p = snapshot.projection;
  if (!p || !Number.isFinite(p.fovDegrees) || p.fovDegrees <= 0 || p.fovDegrees >= 180 ||
      !Number.isFinite(p.aspectRatio) || p.aspectRatio <= 0 ||
      !Number.isFinite(p.nearPlane) || p.nearPlane <= 0 ||
      !Number.isFinite(p.farPlane) || p.farPlane <= p.nearPlane ||
      !Number.isFinite(p.viewportWidth) || p.viewportWidth <= 0 ||
      !Number.isFinite(p.viewportHeight) || p.viewportHeight <= 0) {
    throw new RangeError("Camera projection and viewport values are invalid.");
  }
  if (snapshot.attachment) validateCameraAttachmentConfiguration(snapshot.attachment);
}

export function validateSynchronizedPerspectiveCapture(
  capture: SynchronizedPerspectiveCapture,
): void {
  if (capture.schemaVersion !== "big3r-synchronized-perspectives/1.0") {
    throw new TypeError("Synchronized perspective capture has an unsupported schema version.");
  }
  assertNonEmpty(capture.captureId, "captureId");
  assertNonEmpty(capture.observedSubjectId, "observedSubjectId");
  assertNonEmpty(capture.configurationVersion, "configurationVersion");
  assertNonEmpty(capture.growthStateId, "growthStateId");
  if (!Number.isFinite(capture.simulationTimeSeconds) || capture.simulationTimeSeconds < 0) {
    throw new RangeError("Capture simulationTimeSeconds must be finite and non-negative.");
  }
  if (!Array.isArray(capture.perspectives) || capture.perspectives.length < 2) {
    throw new RangeError("A synchronized capture requires at least two perspectives.");
  }
  const ids = new Set<string>();
  for (const perspective of capture.perspectives) {
    validateCameraPerspectiveSnapshot(perspective);
    if (ids.has(perspective.perspectiveId)) {
      throw new TypeError(`Duplicate perspectiveId "${perspective.perspectiveId}".`);
    }
    ids.add(perspective.perspectiveId);
    if (perspective.observedSubjectId !== capture.observedSubjectId ||
        perspective.configurationVersion !== capture.configurationVersion ||
        perspective.growthStateId !== capture.growthStateId ||
        perspective.simulationTimeSeconds !== capture.simulationTimeSeconds) {
      throw new RangeError(
        "All perspectives must observe the same subject, configuration, growth state, and simulation time.",
      );
    }
  }
}
