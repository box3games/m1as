/**
 * Portable anchor and scale-relationship contract for BIG3R/VFXR.
 *
 * Anchors describe stable reference points; relationships compare subjects
 * and landmarks across a preserved baseline and a current observation.
 * This contract is renderer-independent and does not create live anchors.
 */

export type AnchorGroup = "character" | "stage" | "camera" | "environment";
export type AnchorCoordinateSpace =
  | "sprite-local"
  | "plane-local"
  | "subject-local"
  | "stage-world"
  | "camera-relative"
  | "screen-normalized"
  | "viewport-normalized";
export type AnchorAccess = "read-only" | "read-write";

export interface AnchorVector3 {
  x: number;
  y: number;
  z: number;
}

export interface PortableAnchor {
  /** Stable identity within the owning subject/stage/camera namespace. */
  anchorId: string;
  ownerId: string;
  group: AnchorGroup;
  semantic: string;
  coordinateSpace: AnchorCoordinateSpace;
  position: AnchorVector3;
  /** Optional Euler orientation in radians. */
  rotation?: AnchorVector3;
  /** Optional stable parent anchor for attachment hierarchies. */
  parentAnchorId?: string;
  access: AnchorAccess;
  source: string;
  sourceVersion: string;
}

export interface PortableAnchorSnapshot {
  schemaVersion: "big3r-portable-anchors/1.0";
  capturedAtSimulationTimeSeconds: number;
  configurationVersion: string;
  anchors: PortableAnchor[];
}

export interface AnchorSpanReference {
  ownerId: string;
  lowerAnchorId: string;
  upperAnchorId: string;
  /** The two anchors must share this coordinate space. */
  coordinateSpace: AnchorCoordinateSpace;
}

export interface ScaleRelationshipInput {
  relationshipId: string;
  baselineSubject: PortableAnchorSnapshot;
  currentSubject: PortableAnchorSnapshot;
  baselineReference: PortableAnchorSnapshot;
  currentReference: PortableAnchorSnapshot;
  subjectSpan: AnchorSpanReference;
  referenceSpan: AnchorSpanReference;
  /** Relative tolerance around 1.0 treated as an equality band. */
  equalityTolerance?: number;
}

export interface ScaleRelationshipMeasurement {
  relationshipId: string;
  subjectId: string;
  referenceId: string;
  baselineSimulationTimeSeconds: number;
  currentSimulationTimeSeconds: number;
  baselineSubjectHeight: number;
  currentSubjectHeight: number;
  baselineReferenceHeight: number;
  currentReferenceHeight: number;
  subjectGrowthFactorFromBaseline: number;
  baselineSubjectToReferenceRatio: number;
  currentSubjectToReferenceRatio: number;
  relationship: "smaller" | "approximately-equal" | "larger";
  equalityTolerance: number;
  coordinateSpace: AnchorCoordinateSpace;
}

function assertFiniteVector(value: AnchorVector3, label: string): void {
  for (const axis of ["x", "y", "z"] as const) {
    if (!Number.isFinite(value[axis])) {
      throw new RangeError(`${label}.${axis} must be finite.`);
    }
  }
}

function assertSnapshot(snapshot: PortableAnchorSnapshot, label: string): void {
  if (snapshot.schemaVersion !== "big3r-portable-anchors/1.0") {
    throw new TypeError(`${label} has an unsupported anchor schema version.`);
  }
  if (!Number.isFinite(snapshot.capturedAtSimulationTimeSeconds) ||
      snapshot.capturedAtSimulationTimeSeconds < 0 ||
      !snapshot.configurationVersion.trim()) {
    throw new RangeError(`${label} has invalid capture metadata.`);
  }
  const ids = new Set<string>();
  for (const anchor of snapshot.anchors) {
    if (!anchor.anchorId.trim() || !anchor.ownerId.trim() ||
        !anchor.semantic.trim() || !anchor.source.trim() ||
        !anchor.sourceVersion.trim()) {
      throw new TypeError(`${label} contains an anchor with missing identity or provenance.`);
    }
    if (ids.has(anchor.anchorId)) {
      throw new TypeError(`${label} contains duplicate anchor ID "${anchor.anchorId}".`);
    }
    ids.add(anchor.anchorId);
    assertFiniteVector(anchor.position, `${label}.${anchor.anchorId}.position`);
    if (anchor.rotation) assertFiniteVector(anchor.rotation, `${label}.${anchor.anchorId}.rotation`);
  }
  for (const anchor of snapshot.anchors) {
    if (anchor.parentAnchorId && !ids.has(anchor.parentAnchorId)) {
      throw new TypeError(`${label} anchor "${anchor.anchorId}" references a missing parent anchor.`);
    }
  }
}

/** Validate a portable snapshot without assuming every representation has every anchor. */
export function validatePortableAnchorSnapshot(snapshot: PortableAnchorSnapshot): void {
  assertSnapshot(snapshot, "Anchor snapshot");
}

function resolveSpan(
  snapshot: PortableAnchorSnapshot,
  span: AnchorSpanReference,
  label: string,
): number {
  if (!span.ownerId.trim()) throw new TypeError(`${label}.ownerId is required.`);
  const lower = snapshot.anchors.find((anchor) =>
    anchor.anchorId === span.lowerAnchorId && anchor.ownerId === span.ownerId);
  const upper = snapshot.anchors.find((anchor) =>
    anchor.anchorId === span.upperAnchorId && anchor.ownerId === span.ownerId);
  if (!lower || !upper) {
    throw new RangeError(`${label} lower/upper anchors are not both available for owner "${span.ownerId}".`);
  }
  if (lower.coordinateSpace !== span.coordinateSpace ||
      upper.coordinateSpace !== span.coordinateSpace) {
    throw new RangeError(`${label} anchors do not match the declared coordinate space.`);
  }
  if (lower.coordinateSpace !== upper.coordinateSpace) {
    throw new RangeError(`${label} anchors use different coordinate spaces.`);
  }
  const height = Math.abs(upper.position.y - lower.position.y);
  if (!Number.isFinite(height) || height <= 0) {
    throw new RangeError(`${label} vertical anchor span must be finite and greater than zero.`);
  }
  return height;
}

/**
 * Compare a subject's current vertical span to a reference span while retaining
 * the subject's original baseline. The reference may be a person, creature,
 * building, landmark, or any other authored entity with compatible anchors.
 */
export function measureScaleRelationship(
  input: ScaleRelationshipInput,
): ScaleRelationshipMeasurement {
  if (!input.relationshipId.trim()) throw new TypeError("relationshipId is required.");
  assertSnapshot(input.baselineSubject, "baselineSubject");
  assertSnapshot(input.currentSubject, "currentSubject");
  assertSnapshot(input.baselineReference, "baselineReference");
  assertSnapshot(input.currentReference, "currentReference");

  if (input.currentSubject.capturedAtSimulationTimeSeconds <
      input.baselineSubject.capturedAtSimulationTimeSeconds) {
    throw new RangeError("Current subject capture cannot precede its baseline capture.");
  }
  if (input.subjectSpan.ownerId !== input.baselineSubject.anchors.find(
    (anchor) => anchor.anchorId === input.subjectSpan.lowerAnchorId,
  )?.ownerId) {
    throw new RangeError("Subject baseline anchors do not belong to the declared subject.");
  }

  const baselineSubjectHeight = resolveSpan(input.baselineSubject, input.subjectSpan, "subjectSpan");
  const currentSubjectHeight = resolveSpan(input.currentSubject, input.subjectSpan, "subjectSpan");
  const baselineReferenceHeight = resolveSpan(input.baselineReference, input.referenceSpan, "referenceSpan");
  const currentReferenceHeight = resolveSpan(input.currentReference, input.referenceSpan, "referenceSpan");
  if (input.subjectSpan.coordinateSpace !== input.referenceSpan.coordinateSpace) {
    throw new RangeError("Subject and reference spans must use the same coordinate space for direct comparison.");
  }
  const equalityTolerance = input.equalityTolerance ?? 0.02;
  if (!Number.isFinite(equalityTolerance) || equalityTolerance < 0 || equalityTolerance >= 1) {
    throw new RangeError("equalityTolerance must be finite and in [0, 1).");
  }

  const baselineSubjectToReferenceRatio = baselineSubjectHeight / baselineReferenceHeight;
  const currentSubjectToReferenceRatio = currentSubjectHeight / currentReferenceHeight;
  const relationship = currentSubjectToReferenceRatio < 1 - equalityTolerance
    ? "smaller"
    : currentSubjectToReferenceRatio > 1 + equalityTolerance
      ? "larger"
      : "approximately-equal";

  return {
    relationshipId: input.relationshipId,
    subjectId: input.subjectSpan.ownerId,
    referenceId: input.referenceSpan.ownerId,
    baselineSimulationTimeSeconds: input.baselineSubject.capturedAtSimulationTimeSeconds,
    currentSimulationTimeSeconds: input.currentSubject.capturedAtSimulationTimeSeconds,
    baselineSubjectHeight,
    currentSubjectHeight,
    baselineReferenceHeight,
    currentReferenceHeight,
    subjectGrowthFactorFromBaseline: currentSubjectHeight / baselineSubjectHeight,
    baselineSubjectToReferenceRatio,
    currentSubjectToReferenceRatio,
    relationship,
    equalityTolerance,
    coordinateSpace: input.subjectSpan.coordinateSpace,
  };
}
