/**
 * Renderer-neutral Framing Integrity Monitor.
 *
 * Consumes measured projection evidence and an explicit native-recovery
 * assessment. It does not move cameras, alter growth, or choose a renderer.
 */
import type { FramingIntegrityAssessment, FramingIntegrityTrigger } from "./infinity-growth-presentation-contract.js";

export type FramingIntent = "full-body" | "dramatic-crop" | "environment-context" | "free";

export interface NormalizedProjectedBounds {
  /** Full, unclamped viewport-normalized extents; values may be outside [0, 1]. */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ProjectedDepthRange {
  /** Normalized device-coordinate depth; the visible clip interval is [-1, 1]. */
  minimumNdc: number;
  maximumNdc: number;
}

export interface FramingIntegrityObservation {
  sampleId: string;
  subjectId: string;
  simulationTimeSeconds: number;
  configurationVersion: string;
  growthStateId: string;
  framingIntent: FramingIntent;
  /** Null means the renderer could not provide reliable projected bounds. */
  projectedBounds: NormalizedProjectedBounds | null;
  /** Null means depth clipping could not be evaluated. */
  projectedDepthRange: ProjectedDepthRange | null;
  /** Explicit capability/recovery result from the camera presentation adapter. */
  nativeRecoveryAvailable: boolean;
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function validateBounds(bounds: NormalizedProjectedBounds): void {
  for (const key of ["left", "top", "right", "bottom"] as const) {
    if (!Number.isFinite(bounds[key])) {
      throw new RangeError(`projectedBounds.${key} must be finite.`);
    }
  }
  if (bounds.right < bounds.left || bounds.bottom < bounds.top) {
    throw new RangeError("Projected bounds must have non-negative width and height.");
  }
}

function visibleOccupancy(bounds: NormalizedProjectedBounds): number {
  const width = Math.max(0, Math.min(1, bounds.right) - Math.max(0, bounds.left));
  const height = Math.max(0, Math.min(1, bounds.bottom) - Math.max(0, bounds.top));
  return width * height;
}

/**
 * Converts a single projection observation into the IGP framing assessment.
 * Dramatic crops and free framing may intentionally leave screen bounds;
 * depth-plane clipping and unavailable projection evidence remain diagnosable.
 */
export function assessFramingIntegrity(
  observation: FramingIntegrityObservation,
): FramingIntegrityAssessment {
  assertNonEmpty(observation.sampleId, "sampleId");
  assertNonEmpty(observation.subjectId, "subjectId");
  assertNonEmpty(observation.configurationVersion, "configurationVersion");
  assertNonEmpty(observation.growthStateId, "growthStateId");
  if (!Number.isFinite(observation.simulationTimeSeconds) || observation.simulationTimeSeconds < 0) {
    throw new RangeError("simulationTimeSeconds must be finite and non-negative.");
  }
  if (!["full-body", "dramatic-crop", "environment-context", "free"].includes(observation.framingIntent)) {
    throw new TypeError("framingIntent is unsupported.");
  }
  if (typeof observation.nativeRecoveryAvailable !== "boolean") {
    throw new TypeError("nativeRecoveryAvailable must be explicitly provided.");
  }

  let occupancy: number | undefined;
  let depthClipped = false;
  let trigger: FramingIntegrityTrigger | "none" = "none";

  if (observation.projectedBounds === null) {
    trigger = "projected-bounds-unavailable";
  } else {
    validateBounds(observation.projectedBounds);
    occupancy = visibleOccupancy(observation.projectedBounds);
    const bounds = observation.projectedBounds;
    const screenClipped = bounds.left < 0 || bounds.top < 0 || bounds.right > 1 || bounds.bottom > 1;
    const screenFramingRequiresCompleteness =
      observation.framingIntent === "full-body" ||
      observation.framingIntent === "environment-context";

    if (observation.projectedDepthRange === null) {
      trigger = "projected-bounds-unavailable";
    } else {
      const { minimumNdc, maximumNdc } = observation.projectedDepthRange;
      if (!Number.isFinite(minimumNdc) || !Number.isFinite(maximumNdc) || maximumNdc < minimumNdc) {
        throw new RangeError("Projected depth range must be finite and ordered.");
      }
      depthClipped = minimumNdc < -1 || maximumNdc > 1;
      if (depthClipped) {
        trigger = "depth-range-exhausted";
      } else if (screenClipped && screenFramingRequiresCompleteness) {
        trigger = observation.nativeRecoveryAvailable ? "subject-clipped" : "framing-unrecoverable";
      }
    }
  }

  return {
    schemaVersion: "big3r-framing-integrity/1.0",
    sampleId: observation.sampleId,
    subjectId: observation.subjectId,
    simulationTimeSeconds: observation.simulationTimeSeconds,
    configurationVersion: observation.configurationVersion,
    growthStateId: observation.growthStateId,
    trigger,
    ...(occupancy === undefined ? {} : { visibleOccupancy: occupancy }),
    depthClipped,
    nativeRecoveryAvailable: observation.nativeRecoveryAvailable,
  };
}
