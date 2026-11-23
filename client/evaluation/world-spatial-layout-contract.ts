/**
 * Deterministic spatial layout planner for a Colossus world blueprint.
 *
 * Places stable reference/entity identities inside normalized world-envelope
 * coordinates while preserving authored scale. It does not resolve collision,
 * instantiate geometry, or modify hierarchy/growth/presentation state.
 */
import type {
  ColossusWorldGenerationPlan,
  WorldScaleTemplate,
} from "./world-generation-plan-contract.js";
import type { ColossusDimensions } from "./colossus-profile-contract.js";

export const WORLD_SPATIAL_LAYOUT_SCHEMA_VERSION = "big3r-world-spatial-layout/1.0" as const;
export const WORLD_SPATIAL_LAYOUT_ALGORITHM = "radial-rings-mulberry32-v1" as const;

export interface WorldSpatialLayoutConfig {
  layoutId: string;
  configurationVersion: string;
  seed: string | number;
  npcCount: number;
  bossCount: number;
  /** Fraction of each horizontal envelope half-extent reserved at the edge. */
  edgePaddingRatio: number;
  includeTransitionGate: boolean;
}

export interface LayoutVector3 {
  x: number;
  y: number;
  z: number;
}

export type WorldPlacementKind = "colossus" | "npc" | "boss" | "world-landmark" | "transition-gate";
export type WorldPlacementRole = "parent" | "npc" | "boss" | "environment" | "transition";

export interface WorldSpatialPlacement {
  placementId: string;
  entityId: string;
  referenceId: string;
  parentReferenceId?: string;
  kind: WorldPlacementKind;
  role: WorldPlacementRole;
  displayName: string;
  /** Ground-contact anchor in canonical world metres. */
  positionMeters: LayoutVector3;
  /** X/Z anchor normalized to the world envelope, where its centre is (0,0). */
  normalizedPosition: { x: number; z: number };
  dimensions: ColossusDimensions;
  sourceTemplateId?: string;
  relativeHeightRatio: number;
  anchorInsideEnvelope: true;
  footprintFitsEnvelope: boolean;
  /** True when entity dimensions exceed the envelope on any axis. */
  extentExceedsEnvelope: boolean;
  /** Geometry/collision resolution is intentionally a downstream responsibility. */
  collisionResolved: false;
  destinationParentReferenceId?: string;
}

export interface SpatialOverlapDiagnostic {
  firstPlacementId: string;
  secondPlacementId: string;
  overlapAxes: Array<"x" | "z">;
  severity: "aabb-overlap-candidate";
}

export interface WorldSpatialLayoutPlan {
  schemaVersion: typeof WORLD_SPATIAL_LAYOUT_SCHEMA_VERSION;
  layoutAlgorithm: typeof WORLD_SPATIAL_LAYOUT_ALGORITHM;
  layoutId: string;
  configurationVersion: string;
  layoutSeed: string | number;
  sourceGenerationId: string;
  sourceProfileId: string;
  sourceProfileRevision: number;
  worldId: string;
  worldEnvelope: ColossusDimensions;
  placements: WorldSpatialPlacement[];
  overlapDiagnostics: SpatialOverlapDiagnostic[];
  diagnostics: {
    placementCount: number;
    anchorCountInsideEnvelope: number;
    footprintCountExceedingEnvelope: number;
    overlapCandidateCount: number;
    collisionResolutionPerformed: false;
  };
  authority: {
    worldGeometryInstantiated: false;
    growthStateModified: false;
    hierarchyPromoted: false;
    cameraOrPresentationModified: false;
  };
}

function nonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
}

function validateConfig(config: WorldSpatialLayoutConfig): void {
  if (!config || typeof config !== "object") throw new TypeError("Spatial layout config is required.");
  nonEmpty(config.layoutId, "layoutId");
  nonEmpty(config.configurationVersion, "configurationVersion");
  if (typeof config.seed !== "string" && !Number.isSafeInteger(config.seed)) {
    throw new TypeError("layout seed must be a string or safe integer.");
  }
  if (typeof config.seed === "string") nonEmpty(config.seed, "seed");
  for (const key of ["npcCount", "bossCount"] as const) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 0 || config[key] > 1000) {
      throw new RangeError(`${key} must be an integer between 0 and 1000.`);
    }
  }
  if (!Number.isFinite(config.edgePaddingRatio) || config.edgePaddingRatio < 0 || config.edgePaddingRatio >= 0.5) {
    throw new RangeError("edgePaddingRatio must be in [0, 0.5).");
  }
  if (typeof config.includeTransitionGate !== "boolean") {
    throw new TypeError("includeTransitionGate must be a boolean.");
  }
}

function hashSeed(seed: string | number): number {
  const value = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: string | number): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function finiteDimensions(value: ColossusDimensions, label: string): void {
  if (!value || !Number.isFinite(value.widthMeters) || value.widthMeters <= 0 ||
      !Number.isFinite(value.heightMeters) || value.heightMeters <= 0 ||
      !Number.isFinite(value.depthMeters) || value.depthMeters <= 0) {
    throw new TypeError(`${label} must contain finite positive dimensions.`);
  }
}

function overlapsOnAxis(a: number, aSize: number, b: number, bSize: number): boolean {
  return Math.abs(a - b) < (aSize + bSize) / 2;
}

function makePlacement(args: {
  plan: ColossusWorldGenerationPlan;
  placementId: string;
  entityId: string;
  referenceId: string;
  parentReferenceId?: string;
  kind: WorldPlacementKind;
  role: WorldPlacementRole;
  displayName: string;
  dimensions: ColossusDimensions;
  normalizedX: number;
  normalizedZ: number;
  relativeHeightRatio: number;
  sourceTemplateId?: string;
  destinationParentReferenceId?: string;
}): WorldSpatialPlacement {
  const envelope = args.plan.worldEnvelope.dimensions;
  const positionMeters = {
    x: args.normalizedX * envelope.widthMeters,
    y: 0,
    z: args.normalizedZ * envelope.depthMeters,
  };
  const footprintFitsEnvelope =
    args.dimensions.widthMeters <= envelope.widthMeters &&
    args.dimensions.depthMeters <= envelope.depthMeters;
  const extentExceedsEnvelope =
    args.dimensions.widthMeters > envelope.widthMeters ||
    args.dimensions.heightMeters > envelope.heightMeters ||
    args.dimensions.depthMeters > envelope.depthMeters;
  return {
    placementId: args.placementId,
    entityId: args.entityId,
    referenceId: args.referenceId,
    ...(args.parentReferenceId ? { parentReferenceId: args.parentReferenceId } : {}),
    kind: args.kind,
    role: args.role,
    displayName: args.displayName,
    positionMeters,
    normalizedPosition: { x: args.normalizedX, z: args.normalizedZ },
    dimensions: { ...args.dimensions },
    ...(args.sourceTemplateId ? { sourceTemplateId: args.sourceTemplateId } : {}),
    relativeHeightRatio: args.relativeHeightRatio,
    anchorInsideEnvelope: true,
    footprintFitsEnvelope,
    extentExceedsEnvelope,
    collisionResolved: false,
    ...(args.destinationParentReferenceId ? { destinationParentReferenceId: args.destinationParentReferenceId } : {}),
  };
}

function placeOnRing(random: () => number, ringMin: number, ringMax: number, edgeLimit: number) {
  const angle = random() * Math.PI * 2;
  const radius = Math.min(ringMin + random() * (ringMax - ringMin), edgeLimit);
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

function templateFor(plan: ColossusWorldGenerationPlan, kind: "npc" | "boss"): WorldScaleTemplate {
  const template = plan.scaleTemplates.find(item => item.kind === kind);
  if (!template) throw new TypeError(`World generation plan is missing its ${kind} template.`);
  finiteDimensions(template.dimensions, `${kind} template dimensions`);
  return template;
}

/** Creates a deterministic layout blueprint without changing scale or world state. */
export function buildWorldSpatialLayoutPlan(
  plan: ColossusWorldGenerationPlan,
  config: WorldSpatialLayoutConfig,
): WorldSpatialLayoutPlan {
  validateConfig(config);
  if (!plan || plan.schemaVersion !== "big3r-world-generation-plan/1.0") {
    throw new TypeError("Unsupported or missing Colossus world-generation plan.");
  }
  finiteDimensions(plan.worldEnvelope.dimensions, "worldEnvelope");
  finiteDimensions(plan.colossus.dimensions, "Colossus dimensions");
  if (!Array.isArray(plan.scaleTemplates)) throw new TypeError("scaleTemplates must be an array.");
  const random = createRandom(`${String(config.seed)}|${plan.generationId}|${config.layoutId}`);
  const edgeLimit = 0.5 - config.edgePaddingRatio;
  const envelope = plan.worldEnvelope.dimensions;
  const placements: WorldSpatialPlacement[] = [];

  placements.push(makePlacement({
    plan,
    placementId: `${config.layoutId}:colossus`,
    entityId: plan.colossus.entityId,
    referenceId: plan.colossus.referenceId,
    kind: "colossus",
    role: "parent",
    displayName: plan.colossus.displayName,
    dimensions: plan.colossus.dimensions,
    normalizedX: 0,
    normalizedZ: 0,
    relativeHeightRatio: 1,
  }));

  const npcTemplate = templateFor(plan, "npc");
  for (let index = 0; index < config.npcCount; index += 1) {
    const point = placeOnRing(random, 0.08, 0.23, edgeLimit);
    const suffix = String(index + 1).padStart(3, "0");
    placements.push(makePlacement({
      plan,
      placementId: `${config.layoutId}:npc:${suffix}`,
      entityId: `${plan.colossus.referenceId}:npc:${suffix}`,
      referenceId: `${plan.colossus.referenceId}:npc-ref:${suffix}`,
      parentReferenceId: plan.colossus.referenceId,
      kind: "npc",
      role: "npc",
      displayName: `NPC ${index + 1}`,
      dimensions: npcTemplate.dimensions,
      normalizedX: point.x,
      normalizedZ: point.z,
      relativeHeightRatio: npcTemplate.relativeHeightRatio,
      sourceTemplateId: npcTemplate.templateId,
    }));
  }

  const bossTemplate = templateFor(plan, "boss");
  for (let index = 0; index < config.bossCount; index += 1) {
    const point = placeOnRing(random, 0.27, 0.36, edgeLimit);
    const suffix = String(index + 1).padStart(3, "0");
    placements.push(makePlacement({
      plan,
      placementId: `${config.layoutId}:boss:${suffix}`,
      entityId: `${plan.colossus.referenceId}:boss:${suffix}`,
      referenceId: `${plan.colossus.referenceId}:boss-ref:${suffix}`,
      parentReferenceId: plan.colossus.referenceId,
      kind: "boss",
      role: "boss",
      displayName: `Boss ${index + 1}`,
      dimensions: bossTemplate.dimensions,
      normalizedX: point.x,
      normalizedZ: point.z,
      relativeHeightRatio: bossTemplate.relativeHeightRatio,
      sourceTemplateId: bossTemplate.templateId,
    }));
  }

  const landmarks = plan.scaleTemplates.filter(item => item.kind === "world-landmark");
  landmarks.forEach((template, index) => {
    finiteDimensions(template.dimensions, `landmark ${index + 1} dimensions`);
    const point = placeOnRing(random, 0.37, 0.45, edgeLimit);
    const suffix = String(index + 1).padStart(3, "0");
    placements.push(makePlacement({
      plan,
      placementId: `${config.layoutId}:landmark:${suffix}`,
      entityId: `${plan.colossus.referenceId}:landmark:${suffix}`,
      referenceId: `${plan.colossus.referenceId}:landmark-ref:${suffix}`,
      parentReferenceId: plan.colossus.referenceId,
      kind: "world-landmark",
      role: "environment",
      displayName: template.displayName,
      dimensions: template.dimensions,
      normalizedX: point.x,
      normalizedZ: point.z,
      relativeHeightRatio: template.relativeHeightRatio,
      sourceTemplateId: template.templateId,
    }));
  });

  if (config.includeTransitionGate) {
    const point = { x: 0, z: edgeLimit };
    placements.push(makePlacement({
      plan,
      placementId: `${config.layoutId}:transition-gate`,
      entityId: `${plan.colossus.referenceId}:transition-gate`,
      referenceId: `${plan.colossus.referenceId}:transition-gate-ref`,
      parentReferenceId: plan.colossus.referenceId,
      kind: "transition-gate",
      role: "transition",
      displayName: "Next-world transition gate",
      dimensions: plan.nextParentCandidate.dimensions,
      normalizedX: point.x,
      normalizedZ: point.z,
      relativeHeightRatio: plan.nextParentCandidate.scaleFactor,
      destinationParentReferenceId: plan.nextParentCandidate.referenceId,
    }));
  }

  const overlapDiagnostics: SpatialOverlapDiagnostic[] = [];
  for (let first = 0; first < placements.length; first += 1) {
    for (let second = first + 1; second < placements.length; second += 1) {
      const a = placements[first], b = placements[second];
      const overlapX = overlapsOnAxis(a.positionMeters.x, a.dimensions.widthMeters, b.positionMeters.x, b.dimensions.widthMeters);
      const overlapZ = overlapsOnAxis(a.positionMeters.z, a.dimensions.depthMeters, b.positionMeters.z, b.dimensions.depthMeters);
      if (overlapX && overlapZ) {
        overlapDiagnostics.push({
          firstPlacementId: a.placementId,
          secondPlacementId: b.placementId,
          overlapAxes: ["x", "z"],
          severity: "aabb-overlap-candidate",
        });
      }
    }
  }

  const footprintCountExceedingEnvelope = placements.filter(item => !item.footprintFitsEnvelope).length;
  return {
    schemaVersion: WORLD_SPATIAL_LAYOUT_SCHEMA_VERSION,
    layoutAlgorithm: WORLD_SPATIAL_LAYOUT_ALGORITHM,
    layoutId: config.layoutId,
    configurationVersion: config.configurationVersion,
    layoutSeed: config.seed,
    sourceGenerationId: plan.generationId,
    sourceProfileId: plan.profileId,
    sourceProfileRevision: plan.profileRevision,
    worldId: plan.worldId,
    worldEnvelope: { ...envelope },
    placements,
    overlapDiagnostics,
    diagnostics: {
      placementCount: placements.length,
      anchorCountInsideEnvelope: placements.length,
      footprintCountExceedingEnvelope,
      overlapCandidateCount: overlapDiagnostics.length,
      collisionResolutionPerformed: false,
    },
    authority: {
      worldGeometryInstantiated: false,
      growthStateModified: false,
      hierarchyPromoted: false,
      cameraOrPresentationModified: false,
    },
  };
}
