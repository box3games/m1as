/**
 * Renderer-independent character body architecture and archetype contracts.
 *
 * These definitions describe authored intent and implementation bindings.
 * They do not generate geometry, execute growth, deform rigs, or infer emotion.
 */

export const CHARACTER_BODY_ARCHITECTURE_SCHEMA_VERSION = 1 as const;
export const CHARACTER_BODY_ARCHETYPE_SCHEMA_VERSION = 1 as const;
export const BODY_ARCHETYPE_REGISTRY_SCHEMA_VERSION = 1 as const;

export const STANDARD_ANATOMICAL_REGION_IDS = [
  "root", "full_body", "head", "face", "neck",
  "torso", "spine", "chest", "abdomen", "back", "shoulders",
  "pelvis", "pelvic_floor", "perineum", "groin", "gluteal",
  "upper_arm", "arms", "elbow", "forearm", "wrist", "hand", "hands", "fingers",
  "hip", "thigh", "thighs", "knee", "knees", "lower_leg", "legs", "ankle", "foot", "feet", "toes",
  "clothing", "attachments",
] as const;

export type StandardAnatomicalRegionId = typeof STANDARD_ANATOMICAL_REGION_IDS[number];

/** Custom IDs use a namespace, e.g. "studio:tail_fin". */
declare const anatomicalRegionBrand: unique symbol;
export type AnatomicalRegionId = string & { readonly [anatomicalRegionBrand]: true };
export type SemanticRegionId = StandardAnatomicalRegionId | AnatomicalRegionId;

export function createAnatomicalRegionId(value: string): AnatomicalRegionId {
  const normalized = value.trim();
  if (!/^[a-z][a-z0-9._-]*:[a-z][a-z0-9._-]*$/.test(normalized)) {
    throw new TypeError('Custom anatomical region IDs must use "namespace:region" format.');
  }
  return normalized as AnatomicalRegionId;
}

export type CapabilityState =
  | "declared" | "discovered" | "supported" | "unsupported" | "not_tested" | "failed";

export type GrowthDimension =
  | "scale" | "length" | "volume" | "shape"
  | "proportion" | "distribution" | "growth_field";

export type DeformationDimension =
  | "skeletal" | "soft_tissue" | "surface_continuity" | "joint_constraints"
  | "regional_growth" | "self_contact" | "environment_contact"
  | "attachment_following" | "secondary_motion" | "custom";

export interface BodyPlanDefinition {
  id: string;
  version: string;
  label: string;
  description?: string;
  /** Body plans may be humanoid, non-humanoid, hybrid, or creator-defined. */
  family: "humanoid" | "non_humanoid" | "hybrid" | "creator_defined";
  tags?: string[];
  regionIds: SemanticRegionId[];
}

export interface AnatomicalVocabularyEntry {
  regionId: SemanticRegionId;
  label: string;
  description?: string;
  namespace: string;
  tags?: string[];
  /** Standard entries are engine vocabulary; custom entries remain creator-owned. */
  origin: "standard" | "creator";
}

export type RegionRelationshipKind =
  | "parent_of" | "adjacent_to" | "paired_with"
  | "symmetrical_to" | "connected_to";

export interface AnatomicalRegionRelationship {
  fromRegionId: SemanticRegionId;
  toRegionId: SemanticRegionId;
  kind: RegionRelationshipKind;
  relationshipGroup?: string;
  provenance: "authored" | "derived";
}

export interface BodySurfaceLandmark {
  id: string;
  label?: string;
  /** Stable semantic landmark; mesh vertex indices belong in implementation metadata. */
  semanticKey: string;
  provenance: "authored" | "runtime_discovery";
}

export interface BodySurfaceBinding {
  id: string;
  regionIds: SemanticRegionId[];
  surfaceRef?: string;
  meshId?: string;
  vertexGroupId?: string;
  uvSet?: string;
  materialSlots?: string[];
  landmarks?: BodySurfaceLandmark[];
  deformationDomainIds?: string[];
  state: CapabilityState;
  provenance: "authored" | "runtime_discovery" | "imported";
}

export interface RigRegionBinding {
  id: string;
  regionId: SemanticRegionId;
  boneIds: string[];
  jointIds?: string[];
  skinWeightSetRef?: string;
  constraintSetRef?: string;
  state: CapabilityState;
  provenance: "authored_mapping" | "runtime_discovery" | "imported";
}

export interface RegionalGrowthCapability {
  id: string;
  regionId: SemanticRegionId;
  dimensions: GrowthDimension[];
  state: CapabilityState;
  /** Units are explicit where a dimension requires them; no implicit physical mass. */
  units?: Partial<Record<GrowthDimension, string>>;
  constraints?: Record<string, number | string | boolean>;
  provenance: "authored" | "runtime_discovery" | "validated";
}

export interface RegionalDeformationCapability {
  id: string;
  regionId: SemanticRegionId;
  dimensions: DeformationDimension[];
  state: CapabilityState;
  implementationRefs?: string[];
  constraints?: Record<string, number | string | boolean>;
  provenance: "authored" | "runtime_discovery" | "validated";
}

export interface MorphologyParameter {
  key: string;
  value: number;
  unit: string;
  /** Optional descriptive intent; values are not globally clamped or normalized. */
  intent?: string;
}

export interface RegionalMorphologyProfile {
  regionId: SemanticRegionId;
  parameters: MorphologyParameter[];
  tags?: string[];
}

export type TissueCompositionKind =
  | "skeletal_muscle" | "adipose" | "connective_tissue"
  | "skin" | "fluid" | "organ" | "custom";

export interface TissueCompositionProfile {
  tissueType: TissueCompositionKind;
  customTissueType?: string;
  parameters: MorphologyParameter[];
  regionalDistribution: RegionalMorphologyProfile[];
  description?: string;
}

export interface BodyMorphologyCompositionProfile {
  frame: MorphologyParameter[];
  proportions: MorphologyParameter[];
  silhouette: MorphologyParameter[];
  tissueComposition: TissueCompositionProfile[];
  regionalProfiles: RegionalMorphologyProfile[];
  individualVariation?: MorphologyParameter[];
}

export type PerceptualGoal =
  | "silhouette_dominance" | "perceived_weight" | "proportional_emphasis"
  | "motion_presence" | "comparative_scale" | "visual_anticipation"
  | "transformation_recognition" | "environmental_consequence"
  | "custom";

export interface PerceptualPresentationCue {
  id: string;
  cueType: string;
  goals: PerceptualGoal[];
  targetRegionIds?: SemanticRegionId[];
  /** Authored cue parameters, not a model of a player's internal emotional state. */
  parameters: Record<string, number | string | boolean>;
  authoredIntent?: string;
}

export interface PerceptualCharacterPresentationProfile {
  version: string;
  goals: PerceptualGoal[];
  cues: PerceptualPresentationCue[];
}

export interface CharacterAttachmentDefinition {
  id: string;
  label: string;
  attachmentType: string;
  regionIds: SemanticRegionId[];
  attachPointIds: string[];
  growthResponse: "follow_body" | "independent" | "authored_deformation" | "unsupported";
  clippingPolicy: "report_only" | "warn" | "require_validation" | "custom";
  deformationCapabilityRef?: string;
  compatibleBodyPlanIds?: string[];
}

export interface CharacterDesignIntent {
  id: string;
  version: string;
  summary?: string;
  targetMorphology: BodyMorphologyCompositionProfile;
  perceptualGoals: PerceptualGoal[];
  sourceArchetype?: { archetypeId: string; archetypeVersion: string };
}

export interface CharacterBodyStateSnapshot {
  characterId: string;
  bodyProfileId: string;
  bodyProfileVersion: string;
  simulationTimeSeconds: number;
  /** Measured dimensions with explicit units; physical mass is never inferred here. */
  actualDimensions: { x: number; y: number; z: number; unit: string };
  regionalMorphology: RegionalMorphologyProfile[];
  provenance: string;
  growthEventRefs?: string[];
}

export interface CharacterBodyProfile {
  schemaVersion: typeof CHARACTER_BODY_ARCHITECTURE_SCHEMA_VERSION;
  id: string;
  version: string;
  bodyPlan: BodyPlanDefinition;
  vocabulary: AnatomicalVocabularyEntry[];
  relationships: AnatomicalRegionRelationship[];
  surfaceBindings: BodySurfaceBinding[];
  rigBindings: RigRegionBinding[];
  growthCapabilities: RegionalGrowthCapability[];
  deformationCapabilities: RegionalDeformationCapability[];
  /** Authored/current morphology definition, separate from the creator's target intent. */
  morphology: BodyMorphologyCompositionProfile;
  designIntent?: CharacterDesignIntent;
  presentation: PerceptualCharacterPresentationProfile;
  attachments: CharacterAttachmentDefinition[];
}

export interface CharacterBodyIdentity {
  characterId: string;
  createdAt: string;
  activeBodyProfileId: string;
  activeBodyProfileVersion: string;
  sourceArchetype?: { archetypeId: string; archetypeVersion: string };
  /** References only; authoritative growth records remain in the growth system. */
  growthHistoryRef?: string;
  developmentHistoryRef?: string;
}

export interface CharacterDesignRevision {
  revisionId: string;
  bodyProfileId: string;
  bodyProfileVersion: string;
  parentRevisionId?: string;
  sourceArchetype?: { archetypeId: string; archetypeVersion: string };
  createdAt: string;
  authorId?: string;
  summary?: string;
  changedDomains: string[];
  snapshotRef?: string;
}

export interface CharacterDevelopmentHistory {
  characterId: string;
  revisions: CharacterDesignRevision[];
  /** Growth execution history is referenced, never duplicated here. */
  growthHistoryRef?: string;
}

export interface ArchetypeGrowthPreference {
  regionId: SemanticRegionId;
  dimensions: GrowthDimension[];
  preferences: MorphologyParameter[];
  notes?: string;
}

export interface ArchetypeCapabilityRequirement {
  capability: string;
  regionIds: SemanticRegionId[];
  requirement: "required" | "preferred" | "optional";
  reason?: string;
}

export interface CharacterBodyArchetype {
  schemaVersion: typeof CHARACTER_BODY_ARCHETYPE_SCHEMA_VERSION;
  id: string;
  version: string;
  name: string;
  description?: string;
  tags: string[];
  bodyPlanId: string;
  regionIds: SemanticRegionId[];
  morphology: BodyMorphologyCompositionProfile;
  growthPreferences: ArchetypeGrowthPreference[];
  capabilityRequirements: ArchetypeCapabilityRequirement[];
  presentationIntent?: PerceptualCharacterPresentationProfile;
  parentArchetype?: { archetypeId: string; archetypeVersion: string };
  createdAt: string;
  creatorId?: string;
  /** Optional compatibility hints; never authoritative runtime bone IDs. */
  implementationHints?: {
    compatibleRigFamilies?: string[];
    compatibleAssetTags?: string[];
    notes?: string[];
  };
}

export interface BodyArchetypeRegistryDocument {
  schemaVersion: typeof BODY_ARCHETYPE_REGISTRY_SCHEMA_VERSION;
  registryId: string;
  revision: string;
  archetypes: CharacterBodyArchetype[];
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const unique = (values: string[]): boolean => new Set(values).size === values.length;
const validRegionId = (value: unknown): value is SemanticRegionId => {
  if (typeof value !== "string" || !value.trim()) return false;
  return (STANDARD_ANATOMICAL_REGION_IDS as readonly string[]).includes(value) ||
    /^[a-z][a-z0-9._-]*:[a-z][a-z0-9._-]*$/.test(value);
};

export function validateAnatomicalVocabulary(entries: AnatomicalVocabularyEntry[]): string[] {
  const issues: string[] = [];
  if (!Array.isArray(entries)) return ["vocabulary must be an array"];
  const ids = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    if (!validRegionId(entry?.regionId)) {
      issues.push("vocabulary[" + index + "].regionId is invalid");
      continue;
    }
    if (ids.has(entry.regionId)) issues.push("vocabulary duplicates " + entry.regionId);
    ids.add(entry.regionId);
    if (!nonEmpty(entry.label) || !nonEmpty(entry.namespace)) {
      issues.push("vocabulary[" + index + "] requires label and namespace");
    }
    const isStandard = (STANDARD_ANATOMICAL_REGION_IDS as readonly string[]).includes(entry.regionId);
    if (isStandard && entry.origin !== "standard") issues.push("standard region " + entry.regionId + " must use origin=standard");
    if (!isStandard && entry.origin !== "creator") issues.push("custom region " + entry.regionId + " must use origin=creator");
    if (!isStandard && typeof entry.regionId === "string" && !entry.regionId.startsWith(entry.namespace + ":")) {
      issues.push("custom region " + entry.regionId + " must match its namespace");
    }
  }
  return issues;
}

function validateParameters(parameters: MorphologyParameter[], path: string, issues: string[]): void {
  if (!Array.isArray(parameters)) {
    issues.push(path + " must be an array");
    return;
  }
  const keys: string[] = [];
  parameters.forEach((parameter, index) => {
    const itemPath = path + "[" + index + "]";
    if (!nonEmpty(parameter?.key)) issues.push(itemPath + ".key must be non-empty");
    else keys.push(parameter.key);
    if (!finite(parameter?.value)) issues.push(itemPath + ".value must be finite");
    if (!nonEmpty(parameter?.unit)) issues.push(itemPath + ".unit must be explicit");
  });
  if (!unique(keys)) issues.push(path + " contains duplicate parameter keys");
}

function validateMorphology(morphology: BodyMorphologyCompositionProfile, issues: string[]): void {
  if (!morphology || typeof morphology !== "object") {
    issues.push("morphology must be an object");
    return;
  }
  validateParameters(morphology.frame, "morphology.frame", issues);
  validateParameters(morphology.proportions, "morphology.proportions", issues);
  validateParameters(morphology.silhouette, "morphology.silhouette", issues);
  if (!Array.isArray(morphology.tissueComposition)) issues.push("morphology.tissueComposition must be an array");
  else morphology.tissueComposition.forEach((tissue, index) => {
    const path = "morphology.tissueComposition[" + index + "]";
    if (!tissue || !["skeletal_muscle", "adipose", "connective_tissue", "skin", "fluid", "organ", "custom"].includes(tissue.tissueType)) {
      issues.push(path + ".tissueType is unsupported");
    }
    if (tissue?.tissueType === "custom" && !nonEmpty(tissue.customTissueType)) issues.push(path + ".customTissueType must be named");
    validateParameters(tissue?.parameters, path + ".parameters", issues);
    if (!Array.isArray(tissue?.regionalDistribution)) issues.push(path + ".regionalDistribution must be an array");
    else tissue.regionalDistribution.forEach((region, regionIndex) => {
      if (!validRegionId(region?.regionId)) issues.push(path + ".regionalDistribution[" + regionIndex + "].regionId is invalid");
      validateParameters(region?.parameters, path + ".regionalDistribution[" + regionIndex + "].parameters", issues);
    });
  });
  if (!Array.isArray(morphology.regionalProfiles)) issues.push("morphology.regionalProfiles must be an array");
  else morphology.regionalProfiles.forEach((region, index) => {
    if (!validRegionId(region?.regionId)) issues.push("morphology.regionalProfiles[" + index + "].regionId is invalid");
    validateParameters(region?.parameters, "morphology.regionalProfiles[" + index + "].parameters", issues);
  });
  if (morphology.individualVariation !== undefined) {
    validateParameters(morphology.individualVariation, "morphology.individualVariation", issues);
  }
}

export function validateCharacterBodyProfile(input: unknown): string[] {
  const issues: string[] = [];
  if (!input || typeof input !== "object") return ["body profile must be an object"];
  const profile = input as CharacterBodyProfile;
  if (profile.schemaVersion !== CHARACTER_BODY_ARCHITECTURE_SCHEMA_VERSION) issues.push("schemaVersion is unsupported");
  if (!nonEmpty(profile.id)) issues.push("id must be non-empty");
  if (!nonEmpty(profile.version)) issues.push("version must be non-empty");
  if (!profile.bodyPlan || !nonEmpty(profile.bodyPlan.id) || !nonEmpty(profile.bodyPlan.version) ||
      !nonEmpty(profile.bodyPlan.label) || !Array.isArray(profile.bodyPlan.regionIds)) {
    issues.push("bodyPlan requires id, version, label, and regionIds");
  }
  if (profile.bodyPlan && !["humanoid", "non_humanoid", "hybrid", "creator_defined"].includes(profile.bodyPlan.family)) {
    issues.push("bodyPlan.family is unsupported");
  }
  const declaredRegions = new Set<SemanticRegionId>(Array.isArray(profile.bodyPlan?.regionIds) ? profile.bodyPlan.regionIds : []);
  if (declaredRegions.size !== (profile.bodyPlan?.regionIds?.length ?? 0)) issues.push("bodyPlan.regionIds contains duplicates");
  for (const regionId of declaredRegions) if (!validRegionId(regionId)) issues.push("bodyPlan.regionIds contains invalid ID " + regionId);
  if (!Array.isArray(profile.vocabulary)) issues.push("vocabulary must be an array");
  issues.push(...validateAnatomicalVocabulary(Array.isArray(profile.vocabulary) ? profile.vocabulary : []));
  const vocabularyIds = new Set<SemanticRegionId>((Array.isArray(profile.vocabulary) ? profile.vocabulary : [])
    .filter(entry => entry && validRegionId(entry.regionId))
    .map(entry => entry.regionId));
  for (const regionId of vocabularyIds) {
    if (declaredRegions.size && !declaredRegions.has(regionId)) issues.push("vocabulary region " + regionId + " is absent from bodyPlan.regionIds");
  }
  for (const regionId of declaredRegions) {
    const custom = !(STANDARD_ANATOMICAL_REGION_IDS as readonly string[]).includes(regionId);
    if (custom && !vocabularyIds.has(regionId)) issues.push("custom body-plan region " + regionId + " requires a vocabulary entry");
  }

  const relationships = Array.isArray(profile.relationships) ? profile.relationships : [];
  if (!Array.isArray(profile.relationships)) issues.push("relationships must be an array");
  for (const [index, relationship] of relationships.entries()) {
    if (!relationship || typeof relationship !== "object" ||
        !validRegionId(relationship.fromRegionId) || !validRegionId(relationship.toRegionId)) {
      issues.push("relationships[" + index + "] has invalid region IDs");
      continue;
    }
    if (relationship.fromRegionId === relationship.toRegionId) issues.push("relationships[" + index + "] cannot relate a region to itself");
    if (!["parent_of", "adjacent_to", "paired_with", "symmetrical_to", "connected_to"].includes(relationship?.kind)) {
      issues.push("relationships[" + index + "].kind is unsupported");
    }
    if (declaredRegions.size && (!declaredRegions.has(relationship.fromRegionId) || !declaredRegions.has(relationship.toRegionId))) {
      issues.push("relationships[" + index + "] references a region outside the body plan");
    }
  }
  const parentEdges = relationships.filter(item => item && item.kind === "parent_of");
  for (const start of declaredRegions) {
    const pending: Array<{ regionId: string; path: Set<string> }> = [{ regionId: start, path: new Set([start]) }];
    while (pending.length) {
      const current = pending.pop()!;
      for (const edge of parentEdges) {
        if (edge.fromRegionId !== current.regionId) continue;
        if (current.path.has(edge.toRegionId)) {
          issues.push("parent_of relationships contain a cycle involving " + edge.toRegionId);
          continue;
        }
        const nextPath = new Set(current.path);
        nextPath.add(edge.toRegionId);
        pending.push({ regionId: edge.toRegionId, path: nextPath });
      }
    }
  }

  const checkRegionReferences = (items: Array<{ regionIds?: SemanticRegionId[]; regionId?: SemanticRegionId }>, path: string): void => {
    items.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        issues.push(path + "[" + index + "] must be an object");
        return;
      }
      const refs = item.regionIds ?? (item.regionId ? [item.regionId] : []);
      for (const regionId of refs) {
        if (!validRegionId(regionId)) issues.push(path + "[" + index + "] contains an invalid region ID");
        else if (declaredRegions.size && !declaredRegions.has(regionId)) issues.push(path + "[" + index + "] references undeclared region " + regionId);
      }
    });
  };
  if (!Array.isArray(profile.surfaceBindings)) issues.push("surfaceBindings must be an array");
  else checkRegionReferences(profile.surfaceBindings, "surfaceBindings");
  if (!Array.isArray(profile.rigBindings)) issues.push("rigBindings must be an array");
  else checkRegionReferences(profile.rigBindings, "rigBindings");
  if (!Array.isArray(profile.growthCapabilities)) issues.push("growthCapabilities must be an array");
  else {
    checkRegionReferences(profile.growthCapabilities, "growthCapabilities");
    profile.growthCapabilities.forEach((item, index) => {
      if (!item || !Array.isArray(item.dimensions) || item.dimensions.some(value => !["scale", "length", "volume", "shape", "proportion", "distribution", "growth_field"].includes(value))) {
        issues.push("growthCapabilities[" + index + "].dimensions is invalid");
      }
    });
  }
  if (!Array.isArray(profile.deformationCapabilities)) issues.push("deformationCapabilities must be an array");
  else {
    checkRegionReferences(profile.deformationCapabilities, "deformationCapabilities");
    profile.deformationCapabilities.forEach((item, index) => {
      if (!item || !Array.isArray(item.dimensions) || item.dimensions.some(value => !nonEmpty(value))) {
        issues.push("deformationCapabilities[" + index + "].dimensions is invalid");
      }
    });
  }
  validateMorphology(profile.morphology, issues);
  if (profile.designIntent) {
    if (!nonEmpty(profile.designIntent.id) || !nonEmpty(profile.designIntent.version)) issues.push("designIntent requires id and version");
    validateMorphology(profile.designIntent.targetMorphology, issues);
    const validIntentGoals = ["silhouette_dominance", "perceived_weight", "proportional_emphasis", "motion_presence", "comparative_scale", "visual_anticipation", "transformation_recognition", "environmental_consequence", "custom"];
    if (!Array.isArray(profile.designIntent.perceptualGoals) || profile.designIntent.perceptualGoals.some(goal => !validIntentGoals.includes(goal))) {
      issues.push("designIntent.perceptualGoals is invalid");
    }
  }
  if (!profile.presentation || !nonEmpty(profile.presentation.version) ||
      !Array.isArray(profile.presentation.goals) || !Array.isArray(profile.presentation.cues)) {
    issues.push("presentation requires version, goals, and cues");
  } else {
    const validGoals = ["silhouette_dominance", "perceived_weight", "proportional_emphasis", "motion_presence", "comparative_scale", "visual_anticipation", "transformation_recognition", "environmental_consequence", "custom"];
    if (profile.presentation.goals.some(goal => !validGoals.includes(goal))) issues.push("presentation contains an unsupported perceptual goal");
    const cueIds = profile.presentation.cues.filter(Boolean).map(cue => cue.id);
    if (cueIds.some(id => !nonEmpty(id)) || !unique(cueIds)) issues.push("presentation cue IDs must be non-empty and unique");
    for (const cue of profile.presentation.cues) {
      if (!cue || typeof cue !== "object") {
        issues.push("presentation contains an invalid cue");
        continue;
      }
      if (!nonEmpty(cue.cueType) || !Array.isArray(cue.goals) || cue.goals.some(goal => !validGoals.includes(goal))) {
        issues.push("presentation cue " + cue.id + " has invalid type or goals");
      }
      for (const regionId of cue.targetRegionIds ?? []) {
        if (!validRegionId(regionId) || (declaredRegions.size && !declaredRegions.has(regionId))) issues.push("presentation cue " + cue.id + " references an invalid region");
      }
    }
  }
  if (!Array.isArray(profile.attachments)) issues.push("attachments must be an array");
  else {
    checkRegionReferences(profile.attachments, "attachments");
    const attachmentIds = profile.attachments.filter(Boolean).map(item => item.id);
    if (attachmentIds.some(id => !nonEmpty(id)) || !unique(attachmentIds)) issues.push("attachment IDs must be non-empty and unique");
  }
  return issues;
}

export function validateCharacterBodyStateSnapshot(input: unknown): string[] {
  if (!input || typeof input !== "object") return ["body state snapshot must be an object"];
  const snapshot = input as CharacterBodyStateSnapshot;
  const issues: string[] = [];
  if (!nonEmpty(snapshot.characterId) || !nonEmpty(snapshot.bodyProfileId) || !nonEmpty(snapshot.bodyProfileVersion)) {
    issues.push("body state snapshot requires character and body profile identity");
  }
  if (!finite(snapshot.simulationTimeSeconds) || snapshot.simulationTimeSeconds < 0) {
    issues.push("body state simulationTimeSeconds must be finite and non-negative");
  }
  const dimensions = snapshot.actualDimensions;
  if (!dimensions || !finite(dimensions.x) || !finite(dimensions.y) || !finite(dimensions.z) ||
      !nonEmpty(dimensions.unit)) issues.push("actualDimensions requires finite x/y/z values and an explicit unit");
  if (!Array.isArray(snapshot.regionalMorphology)) issues.push("regionalMorphology must be an array");
  else snapshot.regionalMorphology.forEach((region, index) => {
    if (!region || !validRegionId(region.regionId)) issues.push("regionalMorphology[" + index + "].regionId is invalid");
    else validateParameters(region.parameters, "regionalMorphology[" + index + "].parameters", issues);
  });
  if (!nonEmpty(snapshot.provenance)) issues.push("body state provenance must be non-empty");
  return issues;
}

export interface CharacterBodyArchetypeInstantiationDraft {
  bodyProfile: CharacterBodyProfile;
  sourceArchetype: { archetypeId: string; archetypeVersion: string };
  growthPreferences: ArchetypeGrowthPreference[];
  capabilityRequirements: ArchetypeCapabilityRequirement[];
}

/**
 * Applies an archetype to a compatible editable body-profile template.
 * It returns a draft, not a live character and does not execute growth.
 */
export function instantiateCharacterBodyArchetype(input: {
  baseProfile: CharacterBodyProfile;
  archetype: CharacterBodyArchetype;
  bodyProfileId: string;
  bodyProfileVersion: string;
}): CharacterBodyArchetypeInstantiationDraft {
  const profileIssues = validateCharacterBodyProfile(input.baseProfile);
  if (profileIssues.length) throw new TypeError("Invalid base body profile: " + profileIssues.join("; "));
  const archetypeIssues = validateCharacterBodyArchetype(input.archetype);
  if (archetypeIssues.length) throw new TypeError("Invalid body archetype: " + archetypeIssues.join("; "));
  if (input.baseProfile.bodyPlan.id !== input.archetype.bodyPlanId) {
    throw new TypeError("Archetype body plan is incompatible with the supplied body profile template.");
  }
  const availableRegions = new Set(input.baseProfile.bodyPlan.regionIds);
  const missingRegions = input.archetype.regionIds.filter(regionId => !availableRegions.has(regionId));
  if (missingRegions.length) {
    throw new TypeError("Archetype requires regions absent from the body profile template: " + missingRegions.join(", "));
  }
  if (!nonEmpty(input.bodyProfileId) || !nonEmpty(input.bodyProfileVersion)) {
    throw new TypeError("bodyProfileId and bodyProfileVersion must be non-empty.");
  }
  const sourceArchetype = {
    archetypeId: input.archetype.id,
    archetypeVersion: input.archetype.version,
  };
  const cloned = JSON.parse(JSON.stringify(input.baseProfile)) as CharacterBodyProfile;
  cloned.id = input.bodyProfileId;
  cloned.version = input.bodyProfileVersion;
  cloned.morphology = JSON.parse(JSON.stringify(input.archetype.morphology)) as BodyMorphologyCompositionProfile;
  cloned.designIntent = {
    id: input.archetype.id + ":" + input.archetype.version,
    version: "1",
    summary: input.archetype.description,
    targetMorphology: JSON.parse(JSON.stringify(input.archetype.morphology)) as BodyMorphologyCompositionProfile,
    perceptualGoals: [...(input.archetype.presentationIntent?.goals ?? [])],
    sourceArchetype,
  };
  if (input.archetype.presentationIntent) {
    cloned.presentation = JSON.parse(JSON.stringify(input.archetype.presentationIntent)) as PerceptualCharacterPresentationProfile;
  }
  return {
    bodyProfile: cloned,
    sourceArchetype,
    growthPreferences: JSON.parse(JSON.stringify(input.archetype.growthPreferences)) as ArchetypeGrowthPreference[],
    capabilityRequirements: JSON.parse(JSON.stringify(input.archetype.capabilityRequirements)) as ArchetypeCapabilityRequirement[],
  };
}

export function validateCharacterDevelopmentHistory(input: unknown): string[] {
  if (!input || typeof input !== "object") return ["character development history must be an object"];
  const history = input as CharacterDevelopmentHistory;
  const issues: string[] = [];
  if (!nonEmpty(history.characterId)) issues.push("development history characterId must be non-empty");
  if (!Array.isArray(history.revisions)) return [...issues, "development history revisions must be an array"];
  const byId = new Map<string, CharacterDesignRevision>();
  for (const [index, revision] of history.revisions.entries()) {
    if (!revision || !nonEmpty(revision.revisionId) || !nonEmpty(revision.bodyProfileId) ||
        !nonEmpty(revision.bodyProfileVersion) || !nonEmpty(revision.createdAt) ||
        !Array.isArray(revision.changedDomains)) {
      issues.push("revisions[" + index + "] is incomplete");
      continue;
    }
    if (byId.has(revision.revisionId)) issues.push("duplicate design revision " + revision.revisionId);
    byId.set(revision.revisionId, revision);
  }
  for (const revision of byId.values()) {
    if (revision.parentRevisionId && !byId.has(revision.parentRevisionId)) {
      issues.push("revision " + revision.revisionId + " references missing parent " + revision.parentRevisionId);
    }
    const visited = new Set<string>([revision.revisionId]);
    let parentId = revision.parentRevisionId;
    while (parentId && byId.has(parentId)) {
      if (visited.has(parentId)) {
        issues.push("design revision lineage contains a cycle involving " + parentId);
        break;
      }
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentRevisionId;
    }
  }
  return issues;
}

export function validateCharacterBodyIdentity(input: unknown): string[] {
  if (!input || typeof input !== "object") return ["character body identity must be an object"];
  const identity = input as CharacterBodyIdentity;
  const issues: string[] = [];
  if (!nonEmpty(identity.characterId)) issues.push("characterId must be non-empty");
  if (!nonEmpty(identity.createdAt)) issues.push("createdAt must be non-empty");
  if (!nonEmpty(identity.activeBodyProfileId) || !nonEmpty(identity.activeBodyProfileVersion)) {
    issues.push("active body profile ID and version must be non-empty");
  }
  if (identity.sourceArchetype && (!nonEmpty(identity.sourceArchetype.archetypeId) || !nonEmpty(identity.sourceArchetype.archetypeVersion))) {
    issues.push("sourceArchetype requires archetypeId and archetypeVersion");
  }
  return issues;
}

export function validateCharacterBodyArchetype(input: unknown): string[] {
  const issues: string[] = [];
  if (!input || typeof input !== "object") return ["archetype must be an object"];
  const archetype = input as CharacterBodyArchetype;
  if (archetype.schemaVersion !== CHARACTER_BODY_ARCHETYPE_SCHEMA_VERSION) issues.push("archetype schemaVersion is unsupported");
  for (const key of ["id", "version", "name", "bodyPlanId", "createdAt"] as const) {
    if (!nonEmpty(archetype[key])) issues.push("archetype." + key + " must be non-empty");
  }
  if (!Array.isArray(archetype.tags)) issues.push("archetype.tags must be an array");
  if (!Array.isArray(archetype.regionIds) || archetype.regionIds.some(id => !validRegionId(id))) {
    issues.push("archetype.regionIds must contain valid semantic region IDs");
  } else if (!unique(archetype.regionIds)) issues.push("archetype.regionIds contains duplicates");
  const archetypeRegions = new Set(Array.isArray(archetype.regionIds) ? archetype.regionIds : []);
  validateMorphology(archetype.morphology, issues);
  if (!Array.isArray(archetype.growthPreferences)) issues.push("archetype.growthPreferences must be an array");
  else archetype.growthPreferences.forEach((preference, index) => {
    if (!validRegionId(preference?.regionId) || !archetypeRegions.has(preference.regionId)) issues.push("growthPreferences[" + index + "].regionId is invalid or absent from archetype.regionIds");
    if (!Array.isArray(preference?.dimensions) || preference.dimensions.some(value => !["scale", "length", "volume", "shape", "proportion", "distribution", "growth_field"].includes(value))) {
      issues.push("growthPreferences[" + index + "].dimensions is invalid");
    }
    validateParameters(preference?.preferences, "growthPreferences[" + index + "].preferences", issues);
  });
  if (!Array.isArray(archetype.capabilityRequirements)) issues.push("archetype.capabilityRequirements must be an array");
  else archetype.capabilityRequirements.forEach((requirement, index) => {
    if (!requirement || !nonEmpty(requirement.capability) || !["required", "preferred", "optional"].includes(requirement.requirement)) {
      issues.push("capabilityRequirements[" + index + "] is invalid");
    }
    if (!Array.isArray(requirement?.regionIds) || requirement.regionIds.some(id => !validRegionId(id) || !archetypeRegions.has(id))) {
      issues.push("capabilityRequirements[" + index + "].regionIds is invalid or absent from archetype.regionIds");
    }
  });
  if (archetype.presentationIntent) {
    if (!nonEmpty(archetype.presentationIntent.version) || !Array.isArray(archetype.presentationIntent.goals) ||
        !Array.isArray(archetype.presentationIntent.cues)) {
      issues.push("presentationIntent requires version, goals, and cues");
    }
  }
  if (archetype.parentArchetype && (!nonEmpty(archetype.parentArchetype.archetypeId) || !nonEmpty(archetype.parentArchetype.archetypeVersion))) {
    issues.push("parentArchetype requires archetypeId and archetypeVersion");
  }
  return issues;
}

export function validateBodyArchetypeRegistry(input: unknown): string[] {
  const issues: string[] = [];
  if (!input || typeof input !== "object") return ["archetype registry must be an object"];
  const registry = input as BodyArchetypeRegistryDocument;
  if (registry.schemaVersion !== BODY_ARCHETYPE_REGISTRY_SCHEMA_VERSION) issues.push("registry schemaVersion is unsupported");
  if (!nonEmpty(registry.registryId) || !nonEmpty(registry.revision)) issues.push("registryId and revision must be non-empty");
  if (!Array.isArray(registry.archetypes)) return [...issues, "registry.archetypes must be an array"];
  const versions = new Set<string>();
  registry.archetypes.forEach((archetype, index) => {
    for (const issue of validateCharacterBodyArchetype(archetype)) issues.push("archetypes[" + index + "]: " + issue);
    if (!archetype || typeof archetype !== "object") return;
    const key = archetype.id + "@" + archetype.version;
    if (versions.has(key)) issues.push("registry contains duplicate archetype revision " + key);
    versions.add(key);
  });
  const validArchetypes = registry.archetypes.filter(item => item && typeof item === "object");
  const byRevision = new Map<string, CharacterBodyArchetype>(
    validArchetypes.map(item => [item.id + "@" + item.version, item] as const),
  );
  for (const archetype of validArchetypes) {
    const parent = archetype.parentArchetype;
    if (!parent) continue;
    const parentKey = parent.archetypeId + "@" + parent.archetypeVersion;
    if (parentKey === archetype.id + "@" + archetype.version) {
      issues.push("archetype " + parentKey + " cannot derive from itself");
    } else if (!byRevision.has(parentKey)) {
      issues.push("archetype " + archetype.id + " references missing parent revision " + parentKey);
    }
    const visited = new Set<string>([archetype.id + "@" + archetype.version]);
    let cursor = parentKey;
    while (byRevision.has(cursor)) {
      if (visited.has(cursor)) {
        issues.push("archetype lineage contains a cycle involving " + cursor);
        break;
      }
      visited.add(cursor);
      const next = byRevision.get(cursor)?.parentArchetype;
      if (!next) break;
      cursor = next.archetypeId + "@" + next.archetypeVersion;
    }
  }
  return issues;
}

/**
 * In-memory registry with immutable ID/version entries. Durable persistence is
 * supplied by a later storage adapter; export/import uses plain JSON documents.
 */
export class CharacterBodyArchetypeRegistry {
  private readonly entries = new Map<string, CharacterBodyArchetype>();

  constructor(readonly registryId: string, readonly revision = "1") {
    if (!nonEmpty(registryId) || !nonEmpty(revision)) throw new TypeError("registryId and revision must be non-empty");
  }

  register(archetype: CharacterBodyArchetype): void {
    const key = archetype.id + "@" + archetype.version;
    if (this.entries.has(key)) throw new Error("Archetype revision already exists: " + key);
    const candidate = [...this.entries.values(), archetype];
    const issues = validateBodyArchetypeRegistry({
      schemaVersion: BODY_ARCHETYPE_REGISTRY_SCHEMA_VERSION,
      registryId: this.registryId,
      revision: this.revision,
      archetypes: candidate,
    });
    if (issues.length) throw new TypeError("Invalid body archetype registration: " + issues.join("; "));
    this.entries.set(key, JSON.parse(JSON.stringify(archetype)) as CharacterBodyArchetype);
  }

  get(archetypeId: string, version: string): CharacterBodyArchetype | undefined {
    const value = this.entries.get(archetypeId + "@" + version);
    return value ? JSON.parse(JSON.stringify(value)) as CharacterBodyArchetype : undefined;
  }

  list(): CharacterBodyArchetype[] {
    return [...this.entries.values()]
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id) || a.version.localeCompare(b.version))
      .map(value => JSON.parse(JSON.stringify(value)) as CharacterBodyArchetype);
  }

  toDocument(): BodyArchetypeRegistryDocument {
    return {
      schemaVersion: BODY_ARCHETYPE_REGISTRY_SCHEMA_VERSION,
      registryId: this.registryId,
      revision: this.revision,
      archetypes: this.list(),
    };
  }

  static fromDocument(document: BodyArchetypeRegistryDocument): CharacterBodyArchetypeRegistry {
    const issues = validateBodyArchetypeRegistry(document);
    if (issues.length) throw new TypeError("Invalid archetype registry: " + issues.join("; "));
    const registry = new CharacterBodyArchetypeRegistry(document.registryId, document.revision);
    for (const archetype of document.archetypes) {
      registry.entries.set(
        archetype.id + "@" + archetype.version,
        JSON.parse(JSON.stringify(archetype)) as CharacterBodyArchetype,
      );
    }
    return registry;
  }
}

export function serializeBodyArchetypeRegistry(document: BodyArchetypeRegistryDocument): string {
  const issues = validateBodyArchetypeRegistry(document);
  if (issues.length) throw new TypeError("Cannot serialize invalid archetype registry: " + issues.join("; "));
  return JSON.stringify(document, null, 2);
}

export function parseBodyArchetypeRegistry(json: string): BodyArchetypeRegistryDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new TypeError("Archetype registry JSON is invalid: " + (error instanceof Error ? error.message : String(error)));
  }
  const issues = validateBodyArchetypeRegistry(parsed);
  if (issues.length) throw new TypeError("Invalid archetype registry: " + issues.join("; "));
  return parsed as BodyArchetypeRegistryDocument;
}
