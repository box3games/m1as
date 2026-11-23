/**
 * Deterministic, renderer-neutral world-generation blueprint derived from a
 * Colossus profile. This creates scale templates and reference metadata only;
 * it does not instantiate meshes, choose spatial placements, or mutate worlds.
 */
import {
  validateColossusProfile,
  type ColossusDimensions,
  type ColossusProfile,
} from "./colossus-profile-contract.js";

export interface WorldScaleTemplate {
  templateId: string;
  displayName: string;
  kind: "npc" | "boss" | "world-landmark";
  role: "npc" | "boss" | "environment";
  relativeHeightRatio: number;
  dimensions: ColossusDimensions;
  sourceColossusReferenceId: string;
}

export interface NextParentCandidate {
  referenceId: string;
  entityId: string;
  displayName: string;
  kind: "colossus";
  role: "parent";
  introducedInWorldId: string;
  sourceReferenceId: string;
  scaleFactor: number;
  dimensions: ColossusDimensions;
}

export interface ColossusWorldGenerationPlan {
  schemaVersion: "big3r-world-generation-plan/1.0";
  generationId: string;
  profileId: string;
  profileRevision: number;
  configurationVersion: string;
  seed: string | number;
  algorithm: "mulberry32-v1";
  worldId: string;
  colossus: {
    referenceId: string;
    entityId: string;
    displayName: string;
    dimensions: ColossusDimensions;
  };
  worldEnvelope: {
    dimensions: ColossusDimensions;
    /** Actual envelope height divided by Colossus height. */
    actualHeightRatio: number;
    /** Authored target ratio from the profile, retained without coercion. */
    configuredHeightMultiplier: number;
    configuredMultiplierMatchesEnvelope: boolean;
  };
  scaleTemplates: WorldScaleTemplate[];
  nextParentCandidate: NextParentCandidate;
  authority: {
    worldGeometryInstantiated: false;
    spatialPlacementGenerated: false;
    growthStateModified: false;
    cameraOrPresentationModified: false;
    hierarchyPromoted: false;
  };
}

function scaledDimensions(dimensions: ColossusDimensions, factor: number): ColossusDimensions {
  return {
    widthMeters: dimensions.widthMeters * factor,
    heightMeters: dimensions.heightMeters * factor,
    depthMeters: dimensions.depthMeters * factor,
  };
}

function closeEnough(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b), 1) * 1e-9;
}

/**
 * Produces stable world-scale templates. Ratios are relative to the active
 * Colossus height and may exceed 1; they are landmarks, not growth limits.
 */
export function buildColossusWorldGenerationPlan(
  profile: ColossusProfile,
): ColossusWorldGenerationPlan {
  validateColossusProfile(profile);
  const { reference, dimensions, worldEnvelope, generation } = profile;
  const generationId = `${profile.profileId}:r${profile.revision}:${String(generation.seed)}`;
  const scaleTemplates: WorldScaleTemplate[] = [
    {
      templateId: `${reference.referenceId}:template:npc`,
      displayName: "NPC scale template",
      kind: "npc",
      role: "npc",
      relativeHeightRatio: generation.npcHeightRatio,
      dimensions: scaledDimensions(dimensions, generation.npcHeightRatio),
      sourceColossusReferenceId: reference.referenceId,
    },
    {
      templateId: `${reference.referenceId}:template:boss`,
      displayName: "Boss scale template",
      kind: "boss",
      role: "boss",
      relativeHeightRatio: generation.bossHeightRatio,
      dimensions: scaledDimensions(dimensions, generation.bossHeightRatio),
      sourceColossusReferenceId: reference.referenceId,
    },
    ...generation.referenceLandmarkRatios.map((ratio, index): WorldScaleTemplate => ({
      templateId: `${reference.referenceId}:landmark:${String(index + 1).padStart(3, "0")}`,
      displayName: `Scale landmark ${index + 1}`,
      kind: "world-landmark",
      role: "environment",
      relativeHeightRatio: ratio,
      dimensions: scaledDimensions(dimensions, ratio),
      sourceColossusReferenceId: reference.referenceId,
    })),
  ];
  const actualHeightRatio = worldEnvelope.heightMeters / dimensions.heightMeters;
  const nextWorldId = `${reference.introducedInWorldId}:next`;
  const nextParentCandidate: NextParentCandidate = {
    referenceId: `${reference.referenceId}:next-parent`,
    entityId: `${reference.entityId}:next-parent`,
    displayName: `Next parent after ${reference.displayName}`,
    kind: "colossus",
    role: "parent",
    introducedInWorldId: nextWorldId,
    sourceReferenceId: reference.referenceId,
    scaleFactor: generation.nextParentScaleFactor,
    dimensions: scaledDimensions(dimensions, generation.nextParentScaleFactor),
  };

  return {
    schemaVersion: "big3r-world-generation-plan/1.0",
    generationId,
    profileId: profile.profileId,
    profileRevision: profile.revision,
    configurationVersion: profile.configurationVersion,
    seed: generation.seed,
    algorithm: generation.algorithm,
    worldId: reference.introducedInWorldId,
    colossus: {
      referenceId: reference.referenceId,
      entityId: reference.entityId,
      displayName: reference.displayName,
      dimensions: { ...dimensions },
    },
    worldEnvelope: {
      dimensions: { ...worldEnvelope },
      actualHeightRatio,
      configuredHeightMultiplier: generation.worldEnvelopeMultiplier,
      configuredMultiplierMatchesEnvelope: closeEnough(actualHeightRatio, generation.worldEnvelopeMultiplier),
    },
    scaleTemplates,
    nextParentCandidate,
    authority: {
      worldGeometryInstantiated: false,
      spatialPlacementGenerated: false,
      growthStateModified: false,
      cameraOrPresentationModified: false,
      hierarchyPromoted: false,
    },
  };
}
