import type { MotionRigCapabilities, MotionRegion } from "./presentation-motion-contract.js";

export interface CharacterAnimationClipCapability {
  clipId: string;
  durationSeconds: number;
  trackTargets: string[];
  regions: MotionRegion[];
}

export interface CharacterAnimationCapabilityReport {
  rig: MotionRigCapabilities;
  boneNames: string[];
  bonesByRegion: Record<string, string[]>;
  clips: CharacterAnimationClipCapability[];
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
  ["legs", /leg|thigh|knee|calf/],
  ["feet", /foot|feet|ankle|toe/],
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

/**
 * Read-only discovery adapter. It deliberately advertises no executable layer
 * modes: the current engine has one active locomotion action and direct posture
 * bone writes, so it cannot yet guarantee non-conflicting additive playback.
 */
export function inspectCharacterAnimationCapabilities(input: {
  rigId: string;
  rigVersion?: string;
  boneNames: string[];
  clips: Array<{ name: string; durationSeconds: number; trackNames: string[] }>;
}): CharacterAnimationCapabilityReport {
  const boneNames = [...new Set(input.boneNames.filter(name => name.trim().length > 0))].sort();
  const bonesByRegion: Record<string, string[]> = {};
  for (const region of regionsForNames(boneNames)) {
    bonesByRegion[region] = boneNames.filter(name =>
      REGION_PATTERNS.some(([candidate, pattern]) => candidate === region && pattern.test(name.toLowerCase())));
  }

  const clips = input.clips.map(clip => {
    const trackTargets = [...new Set(clip.trackNames.map(name => name.split(/[.[\]]/, 1)[0]).filter(Boolean))].sort();
    return {
      clipId: clip.name,
      durationSeconds: clip.durationSeconds,
      trackTargets,
      regions: regionsForNames(trackTargets),
    };
  }).sort((a, b) => a.clipId.localeCompare(b.clipId));

  const supportedRegions = regionsForNames(boneNames);
  if (boneNames.length > 0) supportedRegions.push("full_body");
  // These are the regions the current engine directly drives through its
  // posture/growth solver or locomotion root transform. Other discovered
  // regions remain available for future adapter-specific evaluation.
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
      // No layered playback is advertised until a non-interfering executor exists.
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
    executionStatus: "discovery_only",
    limitations: [
      "Animation playback remains owned by the existing single-active-action locomotion controller.",
      "Posture and growth response currently write bone transforms directly.",
      "Additive, overlay, and replacement presentation layers are not yet executable through this adapter.",
      "Clip track targets are discovered for inspection; they are not proof of safe blend compatibility.",
      "No per-region applied-motion telemetry or generic joint-constraint enforcement is currently exposed.",
    ],
  };
}
