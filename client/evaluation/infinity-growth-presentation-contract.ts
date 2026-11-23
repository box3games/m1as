/**
 * Infinity Growth Presentation (IGP) contract.
 *
 * IGP is a reversible render-presentation strategy. It may transform the
 * apparent environment and composition, but never owns or rewrites growth,
 * actual dimensions, stage-relative scale, collision, or world simulation.
 */

export type GrowthPresentationMode = "native" | "assisted" | "infinity";
export type InfinityEnvironmentPolicy = "contract-all" | "preserve-calibration";
export type FramingIntegrityTrigger =
  | "subject-clipped"
  | "depth-range-exhausted"
  | "framing-unrecoverable"
  | "projected-bounds-unavailable";

export interface NormalizedViewportPoint {
  x: number;
  y: number;
}

export interface InfinityBackgroundEffects {
  /** Normalized presentation intensity in [0, 1]. */
  cameraShake: number;
  /** Background-only blur intensity in [0, 1]; subject blur is not represented. */
  backgroundBlur: number;
  /** Normalized parallax/contraction accent in [0, 1]. */
  backgroundParallax: number;
  /** Signed normalized horizon displacement. */
  horizonShift: number;
}

export interface InfinityGrowthPresentationSnapshot {
  schemaVersion: "big3r-infinity-growth-presentation/1.0";
  presentationId: string;
  subjectId: string;
  configurationVersion: string;
  simulationTimeSeconds: number;
  growthStateId: string;
  /** Native, assisted, or reverse-world infinity presentation. */
  mode: GrowthPresentationMode;
  /** Whether reference objects contract with the world or remain calibrated. */
  environmentPolicy: InfinityEnvironmentPolicy;
  /** Apparent environment scale multiplier; 1 is unchanged, (0, 1) contracts. */
  environmentPresentationScale: number;
  /** Stable reference anchor IDs excluded from contraction in preserve-calibration mode. */
  calibrationAnchorIds: string[];
  /** Optional composition anchor in normalized viewport coordinates. */
  subjectViewportAnchor?: NormalizedViewportPoint;
  backgroundEffects: InfinityBackgroundEffects;
  /** The diagnostics sample that justified an assisted/infinity transition. */
  framingIntegritySampleId?: string;
  /** Explicitly records that this snapshot is presentation-only. */
  authorityBoundary: "presentation-only";
}

export interface FramingIntegrityAssessment {
  schemaVersion: "big3r-framing-integrity/1.0";
  sampleId: string;
  subjectId: string;
  simulationTimeSeconds: number;
  configurationVersion: string;
  growthStateId: string;
  trigger: FramingIntegrityTrigger | "none";
  /** Measured visible viewport occupancy, if available. */
  visibleOccupancy?: number;
  /** True when projected subject bounds cross the near or far clip plane. */
  depthClipped: boolean;
  /** True when a valid native camera adjustment can recover the declared framing intent. */
  nativeRecoveryAvailable: boolean;
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function assertUnitInterval(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be finite and in [0, 1].`);
  }
}

export function validateInfinityGrowthPresentation(
  snapshot: InfinityGrowthPresentationSnapshot,
): void {
  if (snapshot.schemaVersion !== "big3r-infinity-growth-presentation/1.0") {
    throw new TypeError("Infinity Growth Presentation has an unsupported schema version.");
  }
  assertNonEmpty(snapshot.presentationId, "presentationId");
  assertNonEmpty(snapshot.subjectId, "subjectId");
  assertNonEmpty(snapshot.configurationVersion, "configurationVersion");
  assertNonEmpty(snapshot.growthStateId, "growthStateId");
  if (!Number.isFinite(snapshot.simulationTimeSeconds) || snapshot.simulationTimeSeconds < 0) {
    throw new RangeError("simulationTimeSeconds must be finite and non-negative.");
  }
  if (!["native", "assisted", "infinity"].includes(snapshot.mode)) {
    throw new TypeError("mode is unsupported.");
  }
  if (!["contract-all", "preserve-calibration"].includes(snapshot.environmentPolicy)) {
    throw new TypeError("environmentPolicy is unsupported.");
  }
  if (!Number.isFinite(snapshot.environmentPresentationScale) ||
      snapshot.environmentPresentationScale <= 0 ||
      snapshot.environmentPresentationScale > 1) {
    throw new RangeError("environmentPresentationScale must be finite and in (0, 1].");
  }
  if (snapshot.mode !== "infinity" && snapshot.environmentPresentationScale !== 1) {
    throw new RangeError("Only infinity mode may contract the apparent environment.");
  }
  if (!Array.isArray(snapshot.calibrationAnchorIds)) {
    throw new TypeError("calibrationAnchorIds must be an array.");
  }
  const calibrationIds = new Set<string>();
  for (const id of snapshot.calibrationAnchorIds) {
    assertNonEmpty(id, "calibrationAnchorId");
    if (calibrationIds.has(id)) throw new TypeError(`Duplicate calibration anchor ID "${id}".`);
    calibrationIds.add(id);
  }
  if (snapshot.environmentPolicy === "preserve-calibration" && calibrationIds.size === 0) {
    throw new RangeError("preserve-calibration requires at least one stable calibration anchor.");
  }
  if (snapshot.environmentPolicy === "contract-all" && calibrationIds.size > 0) {
    throw new RangeError("contract-all cannot declare calibration anchors.");
  }
  if (snapshot.subjectViewportAnchor) {
    assertUnitInterval(snapshot.subjectViewportAnchor.x, "subjectViewportAnchor.x");
    assertUnitInterval(snapshot.subjectViewportAnchor.y, "subjectViewportAnchor.y");
  }
  const effects = snapshot.backgroundEffects;
  if (!effects) throw new TypeError("backgroundEffects are required.");
  assertUnitInterval(effects.cameraShake, "backgroundEffects.cameraShake");
  assertUnitInterval(effects.backgroundBlur, "backgroundEffects.backgroundBlur");
  assertUnitInterval(effects.backgroundParallax, "backgroundEffects.backgroundParallax");
  if (!Number.isFinite(effects.horizonShift) || effects.horizonShift < -1 || effects.horizonShift > 1) {
    throw new RangeError("backgroundEffects.horizonShift must be finite and in [-1, 1].");
  }
  if (snapshot.framingIntegritySampleId !== undefined) {
    assertNonEmpty(snapshot.framingIntegritySampleId, "framingIntegritySampleId");
  }
  if (snapshot.authorityBoundary !== "presentation-only") {
    throw new TypeError("IGP must declare the presentation-only authority boundary.");
  }
}

export function validateFramingIntegrityAssessment(
  assessment: FramingIntegrityAssessment,
): void {
  if (assessment.schemaVersion !== "big3r-framing-integrity/1.0") {
    throw new TypeError("Framing integrity assessment has an unsupported schema version.");
  }
  assertNonEmpty(assessment.sampleId, "sampleId");
  assertNonEmpty(assessment.subjectId, "subjectId");
  assertNonEmpty(assessment.configurationVersion, "configurationVersion");
  assertNonEmpty(assessment.growthStateId, "growthStateId");
  if (!Number.isFinite(assessment.simulationTimeSeconds) || assessment.simulationTimeSeconds < 0) {
    throw new RangeError("simulationTimeSeconds must be finite and non-negative.");
  }
  if (!["none", "subject-clipped", "depth-range-exhausted", "framing-unrecoverable",
    "projected-bounds-unavailable"].includes(assessment.trigger)) {
    throw new TypeError("Framing integrity trigger is unsupported.");
  }
  if (assessment.visibleOccupancy !== undefined) {
    assertUnitInterval(assessment.visibleOccupancy, "visibleOccupancy");
  }
  if (typeof assessment.depthClipped !== "boolean" ||
      typeof assessment.nativeRecoveryAvailable !== "boolean") {
    throw new TypeError("Framing integrity flags must be boolean.");
  }
  if (assessment.trigger === "none" && assessment.depthClipped) {
    throw new RangeError("A depth-clipped subject requires an explicit framing trigger.");
  }
}
