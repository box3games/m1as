/**
 * Renderer-independent contract for growth-responsive character presentation motion.
 *
 * This layer describes intent, rig capability, compatibility and applied telemetry.
 * It does not play clips, mutate bones, change growth, or own authoritative posture.
 */

export const CHARACTER_PRESENTATION_MOTION_SCHEMA_VERSION = 1 as const;

export type AuthoritativePosture = "stand" | "hunch" | "crawl";
export type MotionRegion =
  | "root" | "spine" | "chest" | "shoulders" | "arms" | "hands"
  | "pelvis" | "legs" | "feet" | "head" | "face" | "full_body" | string;
export type MotionLayerMode = "additive" | "overlay" | "replace";
export type MotionInterruptionPolicy = "never" | "when_higher_priority" | "when_same_owner" | "always";
export type MotionLifecyclePhase =
  | "requested" | "accepted" | "rejected" | "started" | "peak"
  | "hold" | "release" | "completed" | "interrupted" | "failed";

export interface MotionRigCapabilities {
  rigId: string;
  rigVersion: string;
  adapterKind: "skeletal_glb" | "procedural_rig" | "sprite_2d" | "subject_2_5d" | "hologram" | "other";
  supportedRegions: MotionRegion[];
  supportedLayerModes: MotionLayerMode[];
  /** Regions owned by the authoritative stand/hunch/crawl posture solver. */
  postureControlledRegions: MotionRegion[];
  /** Must be explicitly declared; defaults are never inferred from rig type. */
  postureOverrideAllowed: boolean;
  supportsJointConstraints: boolean;
  supportsPerRegionTelemetry: boolean;
  availableClipIds: string[];
  availableScriptIds: string[];
}

export interface MotionSourceValue {
  status: "available";
  value: number;
  unit: "ratio" | "normalized" | "seconds" | "radians" | "world_units" | "world_units_per_second" | "cycles_per_second" | "authored";
  provenance: string;
}
export type MotionSourceMeasurement =
  | MotionSourceValue
  | { status: "unsupported" | "not_captured" | "failed"; reason: string };

/** These channels deliberately keep four scale/perception measurements independent. */
export interface MotionSourceSnapshot {
  simulationTimeSeconds: number;
  actualScale: MotionSourceMeasurement;
  stageRelativeScale: MotionSourceMeasurement;
  cameraRelativeProjectedScale: MotionSourceMeasurement;
  perceivedMass: MotionSourceMeasurement;
  growthVelocity: MotionSourceMeasurement;
  breathPhase: "inhale" | "hold" | "release" | "inactive" | "unknown";
  breathExpansion: MotionSourceMeasurement;
  internalPressure: MotionSourceMeasurement;
  pressureWave: MotionSourceMeasurement;
}

export interface MotionJointConstraint {
  jointOrRegionId: string;
  minimum?: number;
  maximum?: number;
  unit: "radians" | "ratio" | "normalized" | "authored";
  /** Constraint source is descriptive; the adapter remains responsible for enforcement. */
  source: "rig_limit" | "posture_solver" | "locomotion" | "balance" | "authored";
}

export interface CharacterMotionLayer {
  id: string;
  enabled: boolean;
  /** A clip/script identifier is a reference, not an instruction to invent an asset. */
  asset: { kind: "clip" | "script"; id: string };
  regions: MotionRegion[];
  mode: MotionLayerMode;
  priority: number;
  weight: number;
  blendInSeconds: number;
  blendOutSeconds: number;
  interruption: MotionInterruptionPolicy;
  /** Posture remains authoritative unless both rig and layer explicitly permit override. */
  allowPostureOverride?: boolean;
  constraints?: MotionJointConstraint[];
  sourceChannels: Array<keyof Omit<MotionSourceSnapshot, "simulationTimeSeconds" | "breathPhase">>;
}

export interface CharacterPresentationMotionProfile {
  schemaVersion: typeof CHARACTER_PRESENTATION_MOTION_SCHEMA_VERSION;
  id: string;
  version: string;
  layers: CharacterMotionLayer[];
}

export interface MotionIntent {
  intentId: string;
  layerId: string;
  subjectId: string;
  simulationTimeSeconds: number;
  sourceSnapshot: MotionSourceSnapshot;
}

export interface MotionResolution {
  intentId: string;
  layerId: string;
  status: "accepted" | "rejected";
  reason?: string;
  resolvedPriority?: number;
  resolvedWeight?: number;
  regions?: MotionRegion[];
}

export interface MotionLifecycleEvent {
  eventId: string;
  intentId: string;
  layerId: string;
  subjectId: string;
  experimentId?: string;
  phase: MotionLifecyclePhase;
  simulationTimeSeconds: number;
  sequenceNumber: number;
  reason?: string;
  provenance: string;
}

export interface AppliedMotionRegionTelemetry {
  regionId: string;
  requestedWeight: number;
  appliedWeight: MotionSourceMeasurement;
  requestedValues?: Record<string, number>;
  appliedValues?: Record<string, MotionSourceMeasurement>;
}

export interface AppliedMotionTelemetry {
  intentId: string;
  layerId: string;
  subjectId: string;
  rigId: string;
  asset: { kind: "clip" | "script"; id: string };
  status: "applied" | "partially_applied" | "unsupported" | "not_captured" | "failed";
  regions: AppliedMotionRegionTelemetry[];
  postureAtApplication: AuthoritativePosture;
  postureChangedByMotion: false;
  simulationTimeSeconds: number;
  provenance: string;
  reason?: string;
}

export interface MotionResolutionContext {
  subjectId: string;
  posture: AuthoritativePosture;
  rig: MotionRigCapabilities;
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function validateCharacterPresentationMotionProfile(input: unknown): string[] {
  const issues: string[] = [];
  if (!input || typeof input !== "object") return ["profile must be an object"];
  const profile = input as CharacterPresentationMotionProfile;
  if (profile.schemaVersion !== CHARACTER_PRESENTATION_MOTION_SCHEMA_VERSION) issues.push("schemaVersion is unsupported");
  if (!nonEmpty(profile.id)) issues.push("id must be a non-empty string");
  if (!nonEmpty(profile.version)) issues.push("version must be a non-empty string");
  if (!Array.isArray(profile.layers)) return [...issues, "layers must be an array"];
  const ids = new Set<string>();
  for (const [index, layer] of profile.layers.entries()) {
    const path = `layers[${index}]`;
    if (!nonEmpty(layer?.id)) issues.push(`${path}.id must be a non-empty string`);
    else if (ids.has(layer.id)) issues.push(`${path}.id duplicates ${layer.id}`);
    else ids.add(layer.id);
    if (typeof layer?.enabled !== "boolean") issues.push(`${path}.enabled must be boolean`);
    if (!layer?.asset || !["clip", "script"].includes(layer.asset.kind) || !nonEmpty(layer.asset.id)) {
      issues.push(`${path}.asset must reference a named clip or script`);
    }
    if (!Array.isArray(layer?.regions) || layer.regions.length === 0 ||
        layer.regions.some(region => !nonEmpty(region))) issues.push(`${path}.regions must contain region IDs`);
    if (!layer || !["additive", "overlay", "replace"].includes(layer.mode)) issues.push(`${path}.mode is unsupported`);
    if (!finite(layer?.priority)) issues.push(`${path}.priority must be finite`);
    if (!finite(layer?.weight) || layer.weight < 0 || layer.weight > 1) issues.push(`${path}.weight must be between 0 and 1`);
    if (!finite(layer?.blendInSeconds) || layer.blendInSeconds < 0) issues.push(`${path}.blendInSeconds must be non-negative`);
    if (!finite(layer?.blendOutSeconds) || layer.blendOutSeconds < 0) issues.push(`${path}.blendOutSeconds must be non-negative`);
    if (!layer || !["never", "when_higher_priority", "when_same_owner", "always"].includes(layer.interruption)) {
      issues.push(`${path}.interruption is unsupported`);
    }
    if (!Array.isArray(layer?.sourceChannels)) issues.push(`${path}.sourceChannels must be an array`);
    for (const constraint of layer?.constraints ?? []) {
      if (!nonEmpty(constraint.jointOrRegionId)) issues.push(`${path}.constraints contains an unnamed joint/region`);
      if (constraint.minimum !== undefined && !finite(constraint.minimum)) issues.push(`${path}.constraints minimum must be finite`);
      if (constraint.maximum !== undefined && !finite(constraint.maximum)) issues.push(`${path}.constraints maximum must be finite`);
      if (constraint.minimum !== undefined && constraint.maximum !== undefined && constraint.minimum > constraint.maximum) {
        issues.push(`${path}.constraints minimum exceeds maximum`);
      }
    }
  }
  return issues;
}

/**
 * Deterministic compatibility pass. It never changes a requested weight or
 * substitutes another clip. Unsupported/conflicting intents are explicitly rejected.
 */
export function resolveCharacterMotionIntents(
  profile: CharacterPresentationMotionProfile,
  intents: MotionIntent[],
  context: MotionResolutionContext,
): MotionResolution[] {
  const issues = validateCharacterPresentationMotionProfile(profile);
  if (issues.length) throw new TypeError(`Invalid motion profile: ${issues.join("; ")}`);
  const byId = new Map(profile.layers.map(layer => [layer.id, layer]));
  const ordered = intents.map((intent, index) => ({ intent, index, layer: byId.get(intent.layerId) }))
    .sort((a, b) => (b.layer?.priority ?? Number.NEGATIVE_INFINITY) -
      (a.layer?.priority ?? Number.NEGATIVE_INFINITY) ||
      a.intent.layerId.localeCompare(b.intent.layerId) ||
      a.intent.intentId.localeCompare(b.intent.intentId));
  const accepted: Array<{ layer: CharacterMotionLayer; intent: MotionIntent }> = [];
  const results = new Map<number, MotionResolution>();

  for (const item of ordered) {
    const { intent, layer } = item;
    const reject = (reason: string): void => {
      results.set(item.index, { intentId: intent.intentId, layerId: intent.layerId, status: "rejected", reason });
    };
    if (intent.subjectId !== context.subjectId) { reject("Intent subject does not match the resolved subject."); continue; }
    if (!layer || !layer.enabled) { reject("Motion layer is missing or disabled."); continue; }
    if (!finite(intent.simulationTimeSeconds) || intent.simulationTimeSeconds < 0) { reject("Intent simulation time is invalid."); continue; }
    if (!context.rig.supportedLayerModes.includes(layer.mode)) { reject(`Rig does not support the ${layer.mode} layer mode.`); continue; }
    if (layer.regions.some(region => !context.rig.supportedRegions.includes(region))) {
      reject("One or more requested regions are unsupported by this rig."); continue;
    }
    const availableAssets = layer.asset.kind === "clip" ? context.rig.availableClipIds : context.rig.availableScriptIds;
    if (!availableAssets.includes(layer.asset.id)) { reject(`Rig does not expose the referenced ${layer.asset.kind}.`); continue; }
    const protectedRegions = layer.regions.filter(region => context.rig.postureControlledRegions.includes(region));
    if (protectedRegions.length &&
        !(context.rig.postureOverrideAllowed && layer.allowPostureOverride === true)) {
      reject(`Posture authority (${context.posture}) owns region(s): ${protectedRegions.join(", ")}.`); continue;
    }
    const conflict = accepted.find(existing =>
      layer.mode === "replace" || existing.layer.mode === "replace"
        ? layer.regions.some(region => existing.layer.regions.includes(region))
        : false);
    if (conflict) {
      reject(`Region conflict with higher-priority layer ${conflict.layer.id}; no automatic weight reduction or replacement was applied.`);
      continue;
    }
    accepted.push({ layer, intent });
    results.set(item.index, {
      intentId: intent.intentId, layerId: intent.layerId, status: "accepted",
      resolvedPriority: layer.priority, resolvedWeight: layer.weight, regions: [...layer.regions],
    });
  }
  return intents.map((_, index) => results.get(index)!);
}
