/**
 * Configurable Colossus reference archetype and independent world envelope.
 *
 * Dimensions are expressed in canonical meters. Very small and very large
 * finite values are valid; archetype identity is never inferred from size.
 */
import type { ScaleReferenceNode } from "./scale-reference-hierarchy-contract.js";

export const COLOSSUS_PROFILE_SCHEMA_VERSION = "big3r-colossus-profile/1.0" as const;
export const COLOSSUS_GENERATION_ALGORITHM = "mulberry32-v1" as const;

export interface ColossusDimensions {
  widthMeters: number;
  heightMeters: number;
  depthMeters: number;
}

export interface ColossusGenerationRules {
  mode: "authored" | "procedural" | "hybrid";
  /** Stable seed makes generation inputs reproducible. */
  seed: string | number;
  /** Explicit algorithm version for reproducible procedural output. */
  algorithm: typeof COLOSSUS_GENERATION_ALGORITHM;
  /** Optional independent generated ranges for all three axes, in canonical meters. */
  dimensionRangesMeters?: {
    width: { minimum: number; maximum: number };
    height: { minimum: number; maximum: number };
    depth: { minimum: number; maximum: number };
  };
  /** Optional generated height range in canonical meters. */
  heightRangeMeters?: {
    minimum: number;
    maximum: number;
  };
  /** Generated NPC and boss heights as ratios of the active Colossus height. */
  npcHeightRatio: number;
  bossHeightRatio: number;
  /** Candidate next-parent height relative to this parent; must exceed 1. */
  nextParentScaleFactor: number;
  /** World envelope dimensions relative to the Colossus dimensions. */
  worldEnvelopeMultiplier: number;
  /** Ordered scale landmarks; values are ratios of Colossus height, not caps. */
  referenceLandmarkRatios: number[];
}

export interface ColossusProfile {
  schemaVersion: "big3r-colossus-profile/1.0";
  profileId: string;
  configurationVersion: string;
  revision: number;
  reference: {
    referenceId: string;
    entityId: string;
    displayName: string;
    kind: "colossus";
    role: "parent";
    introducedInWorldId: string;
    sourceReferenceId?: string;
  };
  /** The canonical unit for every dimension and range in this profile is meters. */
  dimensions: ColossusDimensions;
  /** Independent from Colossus dimensions; it is not an implicit scale cap. */
  worldEnvelope: ColossusDimensions;
  generation: ColossusGenerationRules;
  progression: {
    referenceIdentityPersists: true;
    allowRuntimeResizing: true;
    allowSmallerThanCharacter: true;
    allowParentPromotion: true;
  };
}

export interface ResizeColossusProfileInput {
  dimensions: ColossusDimensions;
  worldEnvelope?: ColossusDimensions;
  configurationVersion: string;
}

function nonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function positiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and greater than zero.`);
  }
}

function validateDimensions(dimensions: ColossusDimensions, label: string): void {
  if (!dimensions || typeof dimensions !== "object") {
    throw new TypeError(`${label} is required.`);
  }
  positiveFinite(dimensions.widthMeters, `${label}.widthMeters`);
  positiveFinite(dimensions.heightMeters, `${label}.heightMeters`);
  positiveFinite(dimensions.depthMeters, `${label}.depthMeters`);
}

export function validateColossusProfile(profile: ColossusProfile): void {
  if (profile.schemaVersion !== "big3r-colossus-profile/1.0") {
    throw new TypeError("Colossus profile has an unsupported schema version.");
  }
  nonEmpty(profile.profileId, "profileId");
  nonEmpty(profile.configurationVersion, "configurationVersion");
  if (!Number.isInteger(profile.revision) || profile.revision < 1) {
    throw new RangeError("revision must be a positive integer.");
  }
  nonEmpty(profile.reference.referenceId, "reference.referenceId");
  nonEmpty(profile.reference.entityId, "reference.entityId");
  nonEmpty(profile.reference.displayName, "reference.displayName");
  nonEmpty(profile.reference.introducedInWorldId, "reference.introducedInWorldId");
  if (profile.reference.sourceReferenceId !== undefined) {
    nonEmpty(profile.reference.sourceReferenceId, "reference.sourceReferenceId");
  }
  if (profile.reference.kind !== "colossus" || profile.reference.role !== "parent") {
    throw new TypeError("Colossus identity requires kind 'colossus' and role 'parent'.");
  }
  validateDimensions(profile.dimensions, "dimensions");
  validateDimensions(profile.worldEnvelope, "worldEnvelope");

  const rules = profile.generation;
  if (!rules || !["authored", "procedural", "hybrid"].includes(rules.mode)) {
    throw new TypeError("generation.mode is unsupported.");
  }
  if (typeof rules.seed !== "string" && !Number.isSafeInteger(rules.seed)) {
    throw new TypeError("generation.seed must be a string or safe integer.");
  }
  if (typeof rules.seed === "string") nonEmpty(rules.seed, "generation.seed");
  if (rules.algorithm !== COLOSSUS_GENERATION_ALGORITHM) {
    throw new TypeError("generation.algorithm is unsupported.");
  }
  if (rules.dimensionRangesMeters !== undefined) {
    for (const axis of ["width", "height", "depth"] as const) {
      const range = rules.dimensionRangesMeters[axis];
      if (!range) throw new TypeError(`generation.dimensionRangesMeters.${axis} is required.`);
      positiveFinite(range.minimum, `generation.dimensionRangesMeters.${axis}.minimum`);
      positiveFinite(range.maximum, `generation.dimensionRangesMeters.${axis}.maximum`);
      if (range.maximum < range.minimum) throw new RangeError(`generation.dimensionRangesMeters.${axis}.maximum must be >= minimum.`);
    }
  }
  if (rules.heightRangeMeters !== undefined) {
    positiveFinite(rules.heightRangeMeters.minimum, "generation.heightRangeMeters.minimum");
    positiveFinite(rules.heightRangeMeters.maximum, "generation.heightRangeMeters.maximum");
    if (rules.heightRangeMeters.maximum < rules.heightRangeMeters.minimum) {
      throw new RangeError("Generated height maximum must be at least the minimum.");
    }
  }
  if (rules.mode === "procedural" && !rules.heightRangeMeters && !rules.dimensionRangesMeters) {
    throw new TypeError("Procedural Colossus generation requires heightRangeMeters or dimensionRangesMeters.");
  }
  if (!Number.isFinite(rules.npcHeightRatio) || rules.npcHeightRatio <= 0 || rules.npcHeightRatio > 1) {
    throw new RangeError("npcHeightRatio must be greater than zero and at most one.");
  }
  if (!Number.isFinite(rules.bossHeightRatio) || rules.bossHeightRatio <= 0 || rules.bossHeightRatio > 1) {
    throw new RangeError("bossHeightRatio must be greater than zero and at most one.");
  }
  if (!Number.isFinite(rules.nextParentScaleFactor) || rules.nextParentScaleFactor <= 1) {
    throw new RangeError("nextParentScaleFactor must be greater than one.");
  }
  positiveFinite(rules.worldEnvelopeMultiplier, "generation.worldEnvelopeMultiplier");
  if (!Array.isArray(rules.referenceLandmarkRatios) || rules.referenceLandmarkRatios.length === 0) {
    throw new TypeError("referenceLandmarkRatios must be a non-empty array.");
  }
  let previous = 0;
  for (const ratio of rules.referenceLandmarkRatios) {
    positiveFinite(ratio, "referenceLandmarkRatios entry");
    if (ratio <= previous) {
      throw new RangeError("referenceLandmarkRatios must be strictly increasing.");
    }
    previous = ratio;
  }

  const progression = profile.progression;
  if (progression.referenceIdentityPersists !== true ||
      progression.allowRuntimeResizing !== true ||
      progression.allowSmallerThanCharacter !== true ||
      progression.allowParentPromotion !== true) {
    throw new TypeError("Colossus progression invariants must remain enabled.");
  }
}

/**
 * Converts an authored Colossus profile into the existing persistent
 * hierarchy node. The profile remains the dimensional/configuration source.
 */
export function colossusProfileToScaleReferenceNode(
  profile: ColossusProfile,
): ScaleReferenceNode {
  validateColossusProfile(profile);
  return {
    referenceId: profile.reference.referenceId,
    entityId: profile.reference.entityId,
    displayName: profile.reference.displayName,
    kind: "colossus",
    role: "parent",
    status: "active",
    ...(profile.reference.sourceReferenceId
      ? { sourceReferenceId: profile.reference.sourceReferenceId }
      : {}),
    extent: {
      value: profile.dimensions.heightMeters,
      unit: "m",
      metric: "height",
      axis: "height",
    },
    introducedInWorldId: profile.reference.introducedInWorldId,
  };
}

/**
 * Produces a new profile revision without changing Colossus identity.
 * Callers provide a new configuration version for reproducible capture.
 */
export function resizeColossusProfile(
  profile: ColossusProfile,
  input: ResizeColossusProfileInput,
): ColossusProfile {
  validateColossusProfile(profile);
  nonEmpty(input.configurationVersion, "configurationVersion");
  validateDimensions(input.dimensions, "dimensions");
  if (input.worldEnvelope) validateDimensions(input.worldEnvelope, "worldEnvelope");
  const resized: ColossusProfile = {
    ...profile,
    configurationVersion: input.configurationVersion,
    revision: profile.revision + 1,
    dimensions: { ...input.dimensions },
    worldEnvelope: input.worldEnvelope
      ? { ...input.worldEnvelope }
      : { ...profile.worldEnvelope },
  };
  validateColossusProfile(resized);
  return resized;
}


function seedToUint32(seed: string | number): number {
  if (typeof seed === "number") return seed >>> 0;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Produces deterministic dimensions from the profile's procedural ranges.
 * When only a height range is authored, existing width/height and depth/height
 * proportions are preserved. This generates dimensions only, not world assets.
 */
export function generateColossusDimensions(profile: ColossusProfile): ColossusDimensions {
  validateColossusProfile(profile);
  const rules = profile.generation;
  if (rules.mode === "authored") {
    throw new TypeError("Authored profiles do not request procedural dimension generation.");
  }
  if (!rules.dimensionRangesMeters && !rules.heightRangeMeters) {
    throw new TypeError("Procedural dimension generation requires configured ranges.");
  }
  const random = seededRandom(seedToUint32(rules.seed));
  const sample = (range: { minimum: number; maximum: number }) =>
    range.minimum + random() * (range.maximum - range.minimum);
  if (rules.dimensionRangesMeters) {
    return {
      widthMeters: sample(rules.dimensionRangesMeters.width),
      heightMeters: sample(rules.dimensionRangesMeters.height),
      depthMeters: sample(rules.dimensionRangesMeters.depth),
    };
  }
  const height = sample(rules.heightRangeMeters!);
  return {
    widthMeters: height * (profile.dimensions.widthMeters / profile.dimensions.heightMeters),
    heightMeters: height,
    depthMeters: height * (profile.dimensions.depthMeters / profile.dimensions.heightMeters),
  };
}
