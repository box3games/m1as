import type {
  CharacterRigRegionBinding,
  CharacterRigTopology,
  MotionRigCapabilities,
  MotionRegion,
} from "./presentation-motion-contract.js";

export interface CharacterAnimationClipCapability {
  clipId: string;
  durationSeconds: number;
  trackTargets: string[];
  regions: MotionRegion[];
}

export interface CharacterRigBoneNode {
  boneId: string;
  parentBoneId?: string;
}

export interface AuthoredCharacterRegionMapping {
  regionId: MotionRegion;
  boneIds: string[];
  parentRegionId?: MotionRegion;
  deformable: boolean;
}

export interface CharacterRigTopologyValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CharacterAnimationCapabilityReport {
  rig: MotionRigCapabilities;
  boneNames: string[];
  bonesByRegion: Record<string, string[]>;
  clips: CharacterAnimationClipCapability[];
  topology: CharacterRigTopology;
  topologyValidation: CharacterRigTopologyValidation;
  executionStatus: "discovery_only";
  limitations: string[];
}

const REGION_PATTERNS: Array<[MotionRegion, RegExp]> = [
  ["head", /head|neck/],
  ["face", /face|eye|jaw|mouth/],
  ["spine", /spine|back/],
  ["chest", /chest|torso|rib/],
  ["shoulders", /shoulder|clavicle/],
  ["arms", /arm|elbow|forearm/],
  ["hands", /hand|wrist|finger/],
  ["pelvis", /pelvis|hip/],
  ["pelvic_floor", /pelvic.?floor/],
  ["perineum", /perineum|perineal/],
  ["groin", /groin/],
  ["gluteal", /glute|buttock/],
  ["thighs", /thigh/],
  ["legs", /leg|calf/],
  ["knees", /knee/],
  ["feet", /foot|feet|ankle|toe/],
  ["clothing", /cloth|garment|outfit|armor/],
  ["attachments", /accessory|attachment|wearable|prop/],
  ["root", /root|hips|origin/],
];

function regionsForNames(names: string[]): MotionRegion[] {
  const found = new Set<MotionRegion>();
  for (const name of names) {
    const normalized = name.toLowerCase();
    for (const [region, pattern] of REGION_PATTERNS) {
      if (pattern.test(normalized)) found.add(region);
    }
  }
  return [...found].sort();
}

export function validateCharacterRigTopology(
  topology: CharacterRigTopology,
): CharacterRigTopologyValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!topology.rigId.trim()) errors.push("rigId must be non-empty.");
  if (!topology.rigVersion.trim()) errors.push("rigVersion must be non-empty.");
  const boneIds = new Set(topology.boneIds);
  if (boneIds.size !== topology.boneIds.length) errors.push("boneIds contains duplicates.");
  const hierarchyIds = new Set(topology.boneHierarchy.map(relation => relation.boneId));
  if (hierarchyIds.size !== topology.boneHierarchy.length) errors.push("boneHierarchy contains duplicate bone relations.");
  for (const relation of topology.boneHierarchy) {
    if (!boneIds.has(relation.boneId)) errors.push(`Bone hierarchy references missing bone ${relation.boneId}.`);
    if (relation.parentBoneId && !boneIds.has(relation.parentBoneId)) {
      errors.push(`Bone ${relation.boneId} references missing parent bone ${relation.parentBoneId}.`);
    }
    if (relation.parentBoneId === relation.boneId) errors.push(`Bone ${relation.boneId} cannot parent itself.`);
  }
  const regionIds = new Set<string>();
  for (const region of topology.regions) {
    if (!region.regionId.trim()) errors.push("A region mapping has an empty regionId.");
    if (regionIds.has(region.regionId)) errors.push(`Region mapping duplicates ${region.regionId}.`);
    regionIds.add(region.regionId);
    if (!Array.isArray(region.boneIds) || region.boneIds.length === 0) {
      errors.push(`Region ${region.regionId} must map at least one bone.`);
    }
    for (const boneId of region.boneIds) {
      if (!boneIds.has(boneId)) errors.push(`Region ${region.regionId} references missing bone ${boneId}.`);
    }
    if (region.parentRegionId === region.regionId) {
      errors.push(`Region ${region.regionId} cannot parent itself.`);
    }
  }
  for (const region of topology.regions) {
    if (region.parentRegionId && !regionIds.has(region.parentRegionId)) {
      errors.push(`Region ${region.regionId} references missing parent region ${region.parentRegionId}.`);
    }
  }
  const parentByRegion = new Map(topology.regions.map(region => [region.regionId, region.parentRegionId]));
  for (const start of parentByRegion.keys()) {
    const visited = new Set<string>();
    let current: string | undefined = start;
    while (current) {
      if (visited.has(current)) {
        errors.push(`Region hierarchy contains a cycle involving ${current}.`);
        break;
      }
      visited.add(current);
      current = parentByRegion.get(current);
    }
  }
  if (topology.boneIds.length === 0) warnings.push("No skeletal bones were discovered.");
  if (errors.length === 0 && topology.regions.length === 0) {
    warnings.push("No semantic regions are mapped; author region mappings before enabling deformation.");
  }
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Builds semantic topology from the actual runtime skeleton. Authored mappings
 * take precedence over name heuristics for a region and can map multiple bones.
 */
export function buildCharacterRigTopology(input: {
  rigId: string;
  rigVersion?: string;
  bones: CharacterRigBoneNode[];
  authoredMappings?: AuthoredCharacterRegionMapping[];
}): { topology: CharacterRigTopology; validation: CharacterRigTopologyValidation } {
  const boneIds = [...new Set(input.bones.map(bone => bone.boneId).filter(Boolean))].sort();
  const byRegion = new Map<MotionRegion, CharacterRigRegionBinding>();
  const nameDerived = new Map<MotionRegion, string[]>();
  for (const bone of input.bones) {
    for (const region of regionsForNames([bone.boneId])) {
      const list = nameDerived.get(region) ?? [];
      list.push(bone.boneId);
      nameDerived.set(region, list);
    }
  }
  for (const [regionId, mappedBoneIds] of nameDerived) {
    byRegion.set(regionId, {
      regionId, boneIds: [...new Set(mappedBoneIds)].sort(),
      deformable: false, provenance: "runtime_discovery",
    });
  }
  for (const mapping of input.authoredMappings ?? []) {
    byRegion.set(mapping.regionId, {
      regionId: mapping.regionId,
      boneIds: [...new Set(mapping.boneIds)].sort(),
      ...(mapping.parentRegionId ? { parentRegionId: mapping.parentRegionId } : {}),
      deformable: mapping.deformable,
      provenance: "authored_mapping",
    });
  }
  const topology: CharacterRigTopology = {
    rigId: input.rigId,
    rigVersion: input.rigVersion ?? "runtime-discovery-v1",
    boneIds,
    boneHierarchy: input.bones.map(bone => ({ boneId: bone.boneId, ...(bone.parentBoneId ? { parentBoneId: bone.parentBoneId } : {}) })),
    regions: [...byRegion.values()].sort((a, b) => a.regionId.localeCompare(b.regionId)),
  };
  return { topology, validation: validateCharacterRigTopology(topology) };
}

/**
 * Read-only capability discovery. It does not infer that a discovered bone is
 * safe to deform, nor advertise layered playback before a safe executor exists.
 */
export function inspectCharacterAnimationCapabilities(input: {
  rigId: string;
  rigVersion?: string;
  boneNames: string[];
  boneNodes?: CharacterRigBoneNode[];
  authoredMappings?: AuthoredCharacterRegionMapping[];
  clips: Array<{ name: string; durationSeconds: number; trackNames: string[] }>;
}): CharacterAnimationCapabilityReport {
  const boneNames = [...new Set(input.boneNames.filter(name => name.trim().length > 0))].sort();
  const boneNodes = input.boneNodes ?? boneNames.map(boneId => ({ boneId }));
  const { topology, validation } = buildCharacterRigTopology({
    rigId: input.rigId, rigVersion: input.rigVersion, bones: boneNodes,
    authoredMappings: input.authoredMappings,
  });
  const bonesByRegion: Record<string, string[]> = {};
  for (const region of topology.regions) bonesByRegion[region.regionId] = [...region.boneIds];

  const clips = input.clips.map(clip => {
    const trackTargets = [...new Set(clip.trackNames.map(name => name.split(/[.[\\]]/, 1)[0]).filter(Boolean))].sort();
    return {
      clipId: clip.name,
      durationSeconds: clip.durationSeconds,
      trackTargets,
      regions: regionsForNames(trackTargets),
    };
  }).sort((a, b) => a.clipId.localeCompare(b.clipId));

  const supportedRegions = topology.regions.map(region => region.regionId);
  if (boneNames.length > 0) supportedRegions.push("full_body");
  const postureOwned = new Set<MotionRegion>([
    "root", "spine", "chest", "shoulders", "arms", "legs", "full_body",
  ]);
  const postureControlledRegions = supportedRegions.filter(region => postureOwned.has(region));

  return {
    rig: {
      rigId: input.rigId,
      rigVersion: input.rigVersion ?? "runtime-discovery-v1",
      adapterKind: "skeletal_glb",
      supportedRegions,
      supportedLayerModes: [],
      postureControlledRegions,
      supportsJointConstraints: false,
      supportsPerRegionTelemetry: false,
      availableClipIds: clips.map(clip => clip.clipId),
      availableScriptIds: [],
    },
    boneNames,
    bonesByRegion,
    clips,
    topology,
    topologyValidation: validation,
    executionStatus: "discovery_only",
    limitations: [
      "Runtime name matching is heuristic; authored mappings take precedence.",
      "Runtime-discovered regions are not assumed to be independently deformable.",
      "Animation playback remains owned by the existing single-active-action locomotion controller.",
      "Posture and growth response currently write bone transforms directly.",
      "Additive, overlay, and replacement presentation layers are not yet executable through this adapter.",
      "Clip track targets are discovered for inspection; they are not proof of safe blend compatibility.",
      "No per-region applied-motion telemetry or generic joint-constraint enforcement is currently exposed.",
    ],
  };
}
