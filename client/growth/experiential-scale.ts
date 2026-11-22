import {
  computeCameraRelativeProjectedScale,
  computeStageRelativeScale,
  normalizePerceivedMass,
  type CameraRelativeProjectedScale,
  type PerceivedMassMeasurement,
  type PerceivedMassProfile,
  type ScaleSubjectDimensions,
  type StageRelativeScale,
  type StageScaleReferenceProfile,
} from "./scale-perception.js";

export const EXPERIENTIAL_SCALE_PROFILE_SCHEMA_VERSION = 1 as const;

export interface CameraReferenceProfile {
  id: string;
  version: string;
  stageId: string;
  cameraMode: string;
  referenceProjectedAreaFraction: number;
}
export type PresentationAccentSource =
  | "actual_scale_geometric_mean" | "stage_relative_linear"
  | "camera_relative_area" | "perceived_mass";
export interface PresentationAccentChannel {
  id: string;
  enabled: boolean;
  source: PresentationAccentSource;
  inputRange: { minimum: number; maximum: number };
  outputRange: { minimum: number; maximum: number };
  curve: "linear" | "ease_in" | "ease_out" | "smoothstep";
  clampInput?: boolean;
}
export interface PresentationAccentProfile {
  id: string;
  version: string;
  channels: PresentationAccentChannel[];
}
export interface ExperientialScaleProfileSet {
  schemaVersion: typeof EXPERIENTIAL_SCALE_PROFILE_SCHEMA_VERSION;
  id: string;
  version: string;
  stages: Record<string, StageScaleReferenceProfile>;
  cameras: Record<string, CameraReferenceProfile>;
  perceivedMass: Record<string, PerceivedMassProfile>;
  presentationAccent: PresentationAccentProfile;
}
export interface ResolvedExperientialScaleProfiles {
  stage?: StageScaleReferenceProfile;
  camera?: CameraReferenceProfile;
  perceivedMass?: PerceivedMassProfile;
  presentationAccent?: PresentationAccentProfile;
}
export interface PresentationAccentChannelValue {
  channelId: string;
  source: PresentationAccentSource;
  sourceValue: number;
  mappedTargetValue: number;
  appliedValue: { status: "not_captured"; reason: string };
}
export interface PresentationAccentEvaluation {
  profileId: string;
  profileVersion: string;
  channels: PresentationAccentChannelValue[];
}
export type MeasurementValue<T> =
  | { status: "available"; value: T; provenance: string }
  | { status: "not_captured"; reason: string }
  | { status: "failed"; reason: string };
export interface ExperientialScaleSnapshot {
  profileSet?: { id: string; version: string };
  stageId: string;
  cameraMode: string;
  actualScale: {
    status: "available" | "not_captured" | "failed";
    dimensions?: ScaleSubjectDimensions["dimensions"];
    worldUnit?: string;
    reason?: string;
  };
  stageRelative: MeasurementValue<StageRelativeScale>;
  cameraRelative: MeasurementValue<CameraRelativeProjectedScale>;
  perceivedMass: MeasurementValue<PerceivedMassMeasurement>;
  presentationAccent: MeasurementValue<PresentationAccentEvaluation>;
}

function requireText(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(\`\${name} must be a non-empty string.\`);
}
function requireFinite(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(\`\${name} must be finite.\`);
}
function validateRange(range: { minimum: number; maximum: number }, name: string): void {
  requireFinite(range.minimum, \`\${name}.minimum\`);
  requireFinite(range.maximum, \`\${name}.maximum\`);
  if (range.maximum <= range.minimum) throw new RangeError(\`\${name}.maximum must exceed minimum.\`);
}

/** Runtime validation for imported JSON; no authored numeric defaults are invented. */
export function validateExperientialScaleProfileSet(input: unknown): asserts input is ExperientialScaleProfileSet {
  if (!input || typeof input !== "object") throw new TypeError("Profile set must be an object.");
  const value = input as ExperientialScaleProfileSet;
  if (value.schemaVersion !== EXPERIENTIAL_SCALE_PROFILE_SCHEMA_VERSION) {
    throw new RangeError(\`Unsupported experiential-scale profile schema version: \${String(value.schemaVersion)}.\`);
  }
  requireText(value.id, "profileSet.id");
  requireText(value.version, "profileSet.version");
  if (!value.stages || typeof value.stages !== "object" ||
      !value.cameras || typeof value.cameras !== "object" ||
      !value.perceivedMass || typeof value.perceivedMass !== "object") {
    throw new TypeError("Profile set must include stages, cameras, and perceivedMass maps.");
  }
  for (const [key, profile] of Object.entries(value.stages)) {
    requireText(profile.id, \`stages.\${key}.id\`);
    requireText(profile.version, \`stages.\${key}.version\`);
    requireText(profile.worldUnit, \`stages.\${key}.worldUnit\`);
    for (const axis of ["x", "y", "z"] as const) {
      requireFinite(profile.referenceDimensions?.[axis], \`stages.\${key}.referenceDimensions.\${axis}\`);
      if (profile.referenceDimensions[axis] <= 0) throw new RangeError(\`stages.\${key}.referenceDimensions.\${axis} must be positive.\`);
    }
    if (profile.referenceVolume !== undefined) {
      requireFinite(profile.referenceVolume, \`stages.\${key}.referenceVolume\`);
      if (profile.referenceVolume <= 0) throw new RangeError(\`stages.\${key}.referenceVolume must be positive.\`);
    }
  }
  for (const [key, profile] of Object.entries(value.cameras)) {
    requireText(profile.id, \`cameras.\${key}.id\`);
    requireText(profile.version, \`cameras.\${key}.version\`);
    requireText(profile.stageId, \`cameras.\${key}.stageId\`);
    requireText(profile.cameraMode, \`cameras.\${key}.cameraMode\`);
    requireFinite(profile.referenceProjectedAreaFraction, \`cameras.\${key}.referenceProjectedAreaFraction\`);
    if (profile.referenceProjectedAreaFraction <= 0) throw new RangeError(\`cameras.\${key}.referenceProjectedAreaFraction must be positive.\`);
  }
  for (const [key, profile] of Object.entries(value.perceivedMass)) {
    requireText(profile.id, \`perceivedMass.\${key}.id\`);
    requireText(profile.version, \`perceivedMass.\${key}.version\`);
    requireText(profile.stageId, \`perceivedMass.\${key}.stageId\`);
    requireFinite(profile.authoredValue, \`perceivedMass.\${key}.authoredValue\`);
    validateRange(profile.authoredRange, \`perceivedMass.\${key}.authoredRange\`);
  }
  const accent = value.presentationAccent;
  requireText(accent?.id, "presentationAccent.id");
  requireText(accent?.version, "presentationAccent.version");
  if (!Array.isArray(accent.channels)) throw new TypeError("presentationAccent.channels must be an array.");
  const ids = new Set<string>();
  for (const channel of accent.channels) {
    requireText(channel.id, "presentationAccent channel id");
    if (ids.has(channel.id)) throw new RangeError(\`Duplicate presentation accent channel: \${channel.id}.\`);
    ids.add(channel.id);
    if (typeof channel.enabled !== "boolean") throw new TypeError(\`Channel \${channel.id}.enabled must be boolean.\`);
    if (!["actual_scale_geometric_mean", "stage_relative_linear", "camera_relative_area", "perceived_mass"].includes(channel.source)) {
      throw new RangeError(\`Channel \${channel.id} has an unsupported source.\`);
    }
    validateRange(channel.inputRange, \`channel \${channel.id}.inputRange\`);
    validateRange(channel.outputRange, \`channel \${channel.id}.outputRange\`);
    if (!["linear", "ease_in", "ease_out", "smoothstep"].includes(channel.curve)) {
      throw new RangeError(\`Channel \${channel.id} has an unsupported curve.\`);
    }
  }
}

export function resolveExperientialScaleProfiles(
  profiles: ExperientialScaleProfileSet | null | undefined, stageId: string, cameraMode: string,
): ResolvedExperientialScaleProfiles {
  if (!profiles) return {};
  const stage = profiles.stages[stageId];
  const camera = profiles.cameras[cameraMode];
  const perceivedMass = profiles.perceivedMass[stageId];
  return {
    ...(stage ? { stage } : {}),
    ...(camera && camera.stageId === stageId && camera.cameraMode === cameraMode ? { camera } : {}),
    ...(perceivedMass && perceivedMass.stageId === stageId ? { perceivedMass } : {}),
    presentationAccent: profiles.presentationAccent,
  };
}

function applyCurve(value: number, curve: PresentationAccentChannel["curve"]): number {
  switch (curve) {
    case "ease_in": return value * value;
    case "ease_out": return 1 - (1 - value) * (1 - value);
    case "smoothstep": return value * value * (3 - 2 * value);
    default: return value;
  }
}
export function evaluatePresentationAccents(
  sources: Partial<Record<PresentationAccentSource, number>>, profile: PresentationAccentProfile,
): PresentationAccentEvaluation {
  const channels = profile.channels.filter(channel => channel.enabled).map(channel => {
    const sourceValue = sources[channel.source];
    if (sourceValue === undefined || !Number.isFinite(sourceValue)) {
      throw new RangeError(\`Presentation accent channel "\${channel.id}" has no available source measurement.\`);
    }
    let normalized = (sourceValue - channel.inputRange.minimum) /
      (channel.inputRange.maximum - channel.inputRange.minimum);
    if (channel.clampInput !== false) normalized = Math.max(0, Math.min(1, normalized));
    const curved = applyCurve(normalized, channel.curve);
    return {
      channelId: channel.id, source: channel.source, sourceValue,
      mappedTargetValue: channel.outputRange.minimum + curved * (channel.outputRange.maximum - channel.outputRange.minimum),
      appliedValue: {
        status: "not_captured" as const,
        reason: "The presentation-effect host has not reported an applied value for this channel.",
      },
    };
  });
  return { profileId: profile.id, profileVersion: profile.version, channels };
}

export function measureExperientialScale(input: {
  subject: ScaleSubjectDimensions;
  stageId: string;
  cameraMode: string;
  viewportWidth: number;
  viewportHeight: number;
  normalizedBounds: { left: number; top: number; right: number; bottom: number };
  cameraId: string;
  projection: "perspective" | "orthographic";
  visible: boolean;
  clipped: boolean;
  profiles: ResolvedExperientialScaleProfiles;
  profileSet?: { id: string; version: string };
}): ExperientialScaleSnapshot {
  const { subject, profiles } = input;
  const actualScale = { status: "available" as const, dimensions: { ...subject.dimensions }, worldUnit: subject.worldUnit };
  let stageRelative: MeasurementValue<StageRelativeScale> = {
    status: "not_captured", reason: "No authored stage reference profile is configured for this stage.",
  };
  let cameraRelative: MeasurementValue<CameraRelativeProjectedScale> = {
    status: "not_captured", reason: "No authored camera reference profile is configured for this camera mode.",
  };
  let perceivedMass: MeasurementValue<PerceivedMassMeasurement> = {
    status: "not_captured", reason: "No independently authored perceived-mass profile is configured for this stage.",
  };
  if (profiles.stage) {
    try {
      stageRelative = { status: "available", value: computeStageRelativeScale(subject, profiles.stage), provenance: "authored-stage-reference-v1" };
    } catch (error) {
      stageRelative = { status: "failed", reason: error instanceof Error ? error.message : String(error) };
    }
  }
  if (profiles.camera) {
    try {
      cameraRelative = {
        status: "available",
        value: computeCameraRelativeProjectedScale({
          stageId: input.stageId, referenceProfileId: profiles.camera.id,
          referenceProfileVersion: profiles.camera.version, cameraId: input.cameraId,
          projection: input.projection, viewportWidth: input.viewportWidth,
          viewportHeight: input.viewportHeight, bounds: input.normalizedBounds,
          referenceProjectedAreaFraction: profiles.camera.referenceProjectedAreaFraction,
          visible: input.visible, clipped: input.clipped,
        }),
        provenance: "authored-camera-mode-reference-v1",
      };
    } catch (error) {
      cameraRelative = { status: "failed", reason: error instanceof Error ? error.message : String(error) };
    }
  }
  if (profiles.perceivedMass) {
    try {
      perceivedMass = { status: "available", value: normalizePerceivedMass(profiles.perceivedMass), provenance: "independently-authored-perceived-mass-profile" };
    } catch (error) {
      perceivedMass = { status: "failed", reason: error instanceof Error ? error.message : String(error) };
    }
  }
  let presentationAccent: MeasurementValue<PresentationAccentEvaluation> = {
    status: "not_captured", reason: "No presentation-accent profile is configured.",
  };
  if (profiles.presentationAccent) {
    const sources: Partial<Record<PresentationAccentSource, number>> = {
      actual_scale_geometric_mean: Math.cbrt(subject.dimensions.x * subject.dimensions.y * subject.dimensions.z),
      ...(stageRelative.status === "available" ? { stage_relative_linear: stageRelative.value.geometricMeanLinearRatio } : {}),
      ...(cameraRelative.status === "available" ? { camera_relative_area: cameraRelative.value.relativeMass2D } : {}),
      ...(perceivedMass.status === "available" ? { perceived_mass: perceivedMass.value.normalizedValue } : {}),
    };
    const enabled = profiles.presentationAccent.channels.filter(channel => channel.enabled);
    if (enabled.every(channel => sources[channel.source] !== undefined)) {
      try {
        presentationAccent = { status: "available", value: evaluatePresentationAccents(sources, profiles.presentationAccent), provenance: "data-driven-presentation-accent-mapping" };
      } catch (error) {
        presentationAccent = { status: "failed", reason: error instanceof Error ? error.message : String(error) };
      }
    } else {
      presentationAccent = { status: "not_captured", reason: "One or more enabled accent channels require a measurement that is not available in this sample." };
    }
  }
  return {
    ...(input.profileSet ? { profileSet: input.profileSet } : {}),
    stageId: input.stageId, cameraMode: input.cameraMode, actualScale,
    stageRelative, cameraRelative, perceivedMass, presentationAccent,
  };
}
