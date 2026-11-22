/**
 * Scale and mass-perception measurements.
 *
 * These are observational/presentation measurements. They never mutate the
 * subject's authoritative dimensions or growth state.
 */

export interface ScaleVector3 {
  x: number;
  y: number;
  z: number;
}

export interface ScaleSubjectDimensions {
  subjectId: string;
  dimensions: ScaleVector3;
  worldUnit: string;
}

export interface StageScaleReferenceProfile {
  id: string;
  version: string;
  worldUnit: string;
  referenceDimensions: ScaleVector3;
  /** Optional authored volume in cubic world units; never inferred from scale. */
  referenceVolume?: number;
}

export interface StageRelativeScale {
  stageId: string;
  referenceProfileVersion: string;
  worldUnit: string;
  axisRatios: ScaleVector3;
  geometricMeanLinearRatio: number;
  volumeRatio?: number;
}

export interface CameraProjectedScaleInput {
  cameraId: string;
  projection: "perspective" | "orthographic";
  viewportWidth: number;
  viewportHeight: number;
  /** Normalized top-left-origin bounds. Values may extend beyond [0, 1]. */
  bounds: { left: number; top: number; right: number; bottom: number };
  /** Authored reference footprint as a fraction of the reference viewport area. */
  referenceProjectedAreaFraction: number;
  visible: boolean;
  clipped: boolean;
}

export interface CameraRelativeProjectedScale {
  cameraId: string;
  projection: "perspective" | "orthographic";
  viewportWidth: number;
  viewportHeight: number;
  normalizedBounds: CameraProjectedScaleInput["bounds"];
  projectedWidthFraction: number;
  projectedHeightFraction: number;
  projectedAreaFraction: number;
  relativeMass2D: number;
  visible: boolean;
  clipped: boolean;
}

export interface PerceivedMassProfile {
  id: string;
  version: string;
  authoredValue: number;
  authoredRange: { minimum: number; maximum: number };
}

export interface PerceivedMassMeasurement {
  profileId: string;
  profileVersion: string;
  authoredValue: number;
  normalizedValue: number;
  outOfRange: boolean;
}

export interface ScalePerceptionMeasurements {
  subjectId: string;
  actualDimensions: ScaleVector3;
  worldUnit: string;
  stageRelative: StageRelativeScale;
  cameraRelative: CameraRelativeProjectedScale;
  perceivedMass: PerceivedMassMeasurement;
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and greater than zero.`);
  }
}

function assertDimensions(value: ScaleVector3, name: string): void {
  assertPositiveFinite(value.x, `${name}.x`);
  assertPositiveFinite(value.y, `${name}.y`);
  assertPositiveFinite(value.z, `${name}.z`);
}

/**
 * Computes dimensionless stage-relative measurements. The source dimensions
 * and stage reference must use the same explicitly declared world unit.
 */
export function computeStageRelativeScale(
  subject: ScaleSubjectDimensions,
  profile: StageScaleReferenceProfile,
): StageRelativeScale {
  if (!subject.subjectId.trim() || !profile.id.trim() || !profile.version.trim()) {
    throw new TypeError("Subject and stage reference identifiers are required.");
  }
  if (!subject.worldUnit.trim() || subject.worldUnit !== profile.worldUnit) {
    throw new RangeError("Subject and stage reference world units must match exactly.");
  }
  assertDimensions(subject.dimensions, "subject.dimensions");
  assertDimensions(profile.referenceDimensions, "profile.referenceDimensions");

  const axisRatios = {
    x: subject.dimensions.x / profile.referenceDimensions.x,
    y: subject.dimensions.y / profile.referenceDimensions.y,
    z: subject.dimensions.z / profile.referenceDimensions.z,
  };
  const geometricMeanLinearRatio = Math.cbrt(axisRatios.x * axisRatios.y * axisRatios.z);

  let volumeRatio: number | undefined;
  if (profile.referenceVolume !== undefined) {
    assertPositiveFinite(profile.referenceVolume, "profile.referenceVolume");
    const subjectVolume = subject.dimensions.x * subject.dimensions.y * subject.dimensions.z;
    volumeRatio = subjectVolume / profile.referenceVolume;
  }

  return {
    stageId: profile.id,
    referenceProfileVersion: profile.version,
    worldUnit: subject.worldUnit,
    axisRatios,
    geometricMeanLinearRatio,
    ...(volumeRatio === undefined ? {} : { volumeRatio }),
  };
}

/**
 * Computes camera-relative visual footprint. This is a 2D presence proxy,
 * not physical mass. It is deliberately not clamped to the viewport or [0, 1].
 */
export function computeCameraRelativeProjectedScale(
  input: CameraProjectedScaleInput,
): CameraRelativeProjectedScale {
  if (!input.cameraId.trim()) throw new TypeError("cameraId is required.");
  assertPositiveFinite(input.viewportWidth, "viewportWidth");
  assertPositiveFinite(input.viewportHeight, "viewportHeight");
  assertPositiveFinite(input.referenceProjectedAreaFraction, "referenceProjectedAreaFraction");

  const { left, top, right, bottom } = input.bounds;
  for (const [name, value] of Object.entries(input.bounds)) {
    if (!Number.isFinite(value)) throw new RangeError(`bounds.${name} must be finite.`);
  }
  if (right < left || bottom < top) {
    throw new RangeError("Projected bounds must have non-negative width and height.");
  }

  const projectedWidthFraction = right - left;
  const projectedHeightFraction = bottom - top;
  const projectedAreaFraction = projectedWidthFraction * projectedHeightFraction;

  return {
    cameraId: input.cameraId,
    projection: input.projection,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    normalizedBounds: { ...input.bounds },
    projectedWidthFraction,
    projectedHeightFraction,
    projectedAreaFraction,
    relativeMass2D: projectedAreaFraction / input.referenceProjectedAreaFraction,
    visible: input.visible,
    clipped: input.clipped,
  };
}

/**
 * Maps an authored perceived-mass value into a profile-relative, dimensionless
 * domain. Values outside the authored range remain outside [0, 1] so effects
 * can extrapolate deliberately; the measurement reports that condition.
 */
export function normalizePerceivedMass(
  profile: PerceivedMassProfile,
): PerceivedMassMeasurement {
  if (!profile.id.trim() || !profile.version.trim()) {
    throw new TypeError("Perceived-mass profile ID and version are required.");
  }
  const { minimum, maximum } = profile.authoredRange;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) {
    throw new RangeError("Perceived-mass authored range must have finite maximum > minimum.");
  }
  if (!Number.isFinite(profile.authoredValue)) {
    throw new RangeError("Perceived-mass authored value must be finite.");
  }
  return {
    profileId: profile.id,
    profileVersion: profile.version,
    authoredValue: profile.authoredValue,
    normalizedValue: (profile.authoredValue - minimum) / (maximum - minimum),
    outOfRange: profile.authoredValue < minimum || profile.authoredValue > maximum,
  };
}

/** Creates one coherent measurement snapshot without changing subject state. */
export function measureScalePerception(input: {
  subject: ScaleSubjectDimensions;
  stageProfile: StageScaleReferenceProfile;
  camera: CameraProjectedScaleInput;
  perceivedMassProfile: PerceivedMassProfile;
}): ScalePerceptionMeasurements {
  return {
    subjectId: input.subject.subjectId,
    actualDimensions: { ...input.subject.dimensions },
    worldUnit: input.subject.worldUnit,
    stageRelative: computeStageRelativeScale(input.subject, input.stageProfile),
    cameraRelative: computeCameraRelativeProjectedScale(input.camera),
    perceivedMass: normalizePerceivedMass(input.perceivedMassProfile),
  };
}
