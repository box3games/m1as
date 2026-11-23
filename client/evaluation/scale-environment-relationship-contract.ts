/**
 * Scale-aware subject/environment relationship measurements and response cues.
 *
 * This contract evaluates supplied world-space AABBs. It does not perform
 * physics, collision response, destruction, growth, camera control, or effects.
 */
export const SCALE_ENVIRONMENT_RELATIONSHIP_SCHEMA_VERSION =
  "big3r-scale-environment-relationship/1.0" as const;

export interface WorldAabbMeters {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface ScaleEnvironmentObservation {
  sampleId: string;
  subjectId: string;
  referenceId: string;
  simulationTimeSeconds: number;
  configurationVersion: string;
  growthStateId: string;
  subjectBounds: WorldAabbMeters;
  referenceBounds: WorldAabbMeters;
}

export type EnvironmentSpatialState =
  | "separated"
  | "touching"
  | "overlapping"
  | "subject-contained"
  | "reference-contained"
  | "coincident";

export interface ScaleEnvironmentRelationshipMeasurement {
  schemaVersion: typeof SCALE_ENVIRONMENT_RELATIONSHIP_SCHEMA_VERSION;
  sampleId: string;
  subjectId: string;
  referenceId: string;
  simulationTimeSeconds: number;
  configurationVersion: string;
  growthStateId: string;
  subjectDimensionsMeters: { width: number; height: number; depth: number };
  referenceDimensionsMeters: { width: number; height: number; depth: number };
  subjectToReferenceHeightRatio: number;
  widthOccupancyRatio: number;
  heightOccupancyRatio: number;
  depthOccupancyRatio: number;
  horizontalFootprintOccupancyRatio: number;
  minimumClearanceMeters: number;
  axisClearanceMeters: { x: number; y: number; z: number };
  penetrationDepthMeters: { x: number; y: number; z: number };
  spatialState: EnvironmentSpatialState;
  subjectInsideReference: boolean;
  referenceInsideSubject: boolean;
}

export type EnvironmentResponseMetric =
  | "subjectToReferenceHeightRatio"
  | "widthOccupancyRatio"
  | "heightOccupancyRatio"
  | "depthOccupancyRatio"
  | "horizontalFootprintOccupancyRatio"
  | "minimumClearanceMeters"
  | "penetrationDepthX"
  | "penetrationDepthY"
  | "penetrationDepthZ";

export type EnvironmentResponseKind =
  | "visual-cue"
  | "audio-cue"
  | "interaction-gate"
  | "transition-request"
  | "destruction-candidate"
  | "camera-cue";

export interface EnvironmentResponseRule {
  ruleId: string;
  metric: EnvironmentResponseMetric;
  operator: "greater-than-or-equal" | "less-than-or-equal";
  /** Threshold at which the rule becomes active. */
  threshold: number;
  /** Optional hysteresis threshold at which an active rule becomes inactive. */
  releaseThreshold?: number;
  responseKind: EnvironmentResponseKind;
  responseId: string;
  priority: number;
}

export interface EnvironmentResponseEvaluation {
  ruleId: string;
  responseKind: EnvironmentResponseKind;
  responseId: string;
  priority: number;
  state: "entered" | "maintained" | "exited" | "inactive";
  metric: EnvironmentResponseMetric;
  measuredValue: number;
  threshold: number;
}

export interface ScaleEnvironmentResponseSnapshot {
  schemaVersion: "big3r-scale-environment-response/1.0";
  sampleId: string;
  subjectId: string;
  referenceId: string;
  simulationTimeSeconds: number;
  configurationVersion: string;
  growthStateId: string;
  evaluations: EnvironmentResponseEvaluation[];
  requestedResponses: EnvironmentResponseEvaluation[];
  authority: {
    physicsExecuted: false;
    environmentMoved: false;
    destructionExecuted: false;
    growthStateModified: false;
    cameraOrPresentationModified: false;
    responseExecuted: false;
  };
}

function nonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function validateBounds(bounds: WorldAabbMeters, label: string): void {
  if (!bounds || typeof bounds !== "object" || !bounds.min || !bounds.max) {
    throw new TypeError(`${label} is required.`);
  }
  for (const axis of ["x", "y", "z"] as const) {
    if (!Number.isFinite(bounds.min[axis]) || !Number.isFinite(bounds.max[axis]) ||
        bounds.max[axis] < bounds.min[axis]) {
      throw new RangeError(`${label} has invalid ${axis} bounds.`);
    }
  }
  if (bounds.max.x === bounds.min.x || bounds.max.y === bounds.min.y ||
      bounds.max.z === bounds.min.z) {
    throw new RangeError(`${label} must have positive dimensions on all axes.`);
  }
}

function dimensions(bounds: WorldAabbMeters) {
  const result = {
    width: bounds.max.x - bounds.min.x,
    height: bounds.max.y - bounds.min.y,
    depth: bounds.max.z - bounds.min.z,
  };
  if (!Number.isFinite(result.width) || !Number.isFinite(result.height) ||
      !Number.isFinite(result.depth) || result.width <= 0 ||
      result.height <= 0 || result.depth <= 0) {
    throw new RangeError("AABB dimensions must be finite and positive.");
  }
  return result;
}

function contains(outer: WorldAabbMeters, inner: WorldAabbMeters): boolean {
  return inner.min.x >= outer.min.x && inner.max.x <= outer.max.x &&
    inner.min.y >= outer.min.y && inner.max.y <= outer.max.y &&
    inner.min.z >= outer.min.z && inner.max.z <= outer.max.z;
}

/** Convert a ground-contact placement into a world-space axis-aligned box. */
export function placementToWorldAabbMeters(placement: {
  positionMeters: { x: number; y: number; z: number };
  dimensions: { widthMeters: number; heightMeters: number; depthMeters: number };
}): WorldAabbMeters {
  const { positionMeters: p, dimensions: d } = placement;
  for (const [value, label] of [
    [p?.x, "position.x"], [p?.y, "position.y"], [p?.z, "position.z"],
    [d?.widthMeters, "dimensions.widthMeters"],
    [d?.heightMeters, "dimensions.heightMeters"],
    [d?.depthMeters, "dimensions.depthMeters"],
  ] as const) {
    if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  }
  if (d.widthMeters <= 0 || d.heightMeters <= 0 || d.depthMeters <= 0) {
    throw new RangeError("Placement dimensions must be positive.");
  }
  return {
    min: {
      x: p.x - d.widthMeters / 2,
      y: p.y,
      z: p.z - d.depthMeters / 2,
    },
    max: {
      x: p.x + d.widthMeters / 2,
      y: p.y + d.heightMeters,
      z: p.z + d.depthMeters / 2,
    },
  };
}

/** Measure scale and spatial relationships from same-unit world-space AABBs. */
export function measureScaleEnvironmentRelationship(
  observation: ScaleEnvironmentObservation,
  touchingToleranceMeters = 1e-6,
): ScaleEnvironmentRelationshipMeasurement {
  if (!observation || typeof observation !== "object") throw new TypeError("Observation is required.");
  nonEmpty(observation.sampleId, "sampleId");
  nonEmpty(observation.subjectId, "subjectId");
  nonEmpty(observation.referenceId, "referenceId");
  nonEmpty(observation.configurationVersion, "configurationVersion");
  nonEmpty(observation.growthStateId, "growthStateId");
  if (!Number.isFinite(observation.simulationTimeSeconds) || observation.simulationTimeSeconds < 0) {
    throw new RangeError("simulationTimeSeconds must be finite and non-negative.");
  }
  if (!Number.isFinite(touchingToleranceMeters) || touchingToleranceMeters < 0) {
    throw new RangeError("touchingToleranceMeters must be finite and non-negative.");
  }
  validateBounds(observation.subjectBounds, "subjectBounds");
  validateBounds(observation.referenceBounds, "referenceBounds");

  const subject = dimensions(observation.subjectBounds);
  const reference = dimensions(observation.referenceBounds);
  const axis = (aMin: number, aMax: number, bMin: number, bMax: number) => {
    const gap = Math.max(bMin - aMax, aMin - bMax, 0);
    const penetration = Math.max(Math.min(aMax, bMax) - Math.max(aMin, bMin), 0);
    return { gap, penetration };
  };
  const x = axis(observation.subjectBounds.min.x, observation.subjectBounds.max.x,
    observation.referenceBounds.min.x, observation.referenceBounds.max.x);
  const y = axis(observation.subjectBounds.min.y, observation.subjectBounds.max.y,
    observation.referenceBounds.min.y, observation.referenceBounds.max.y);
  const z = axis(observation.subjectBounds.min.z, observation.subjectBounds.max.z,
    observation.referenceBounds.min.z, observation.referenceBounds.max.z);
  const separated = x.gap > touchingToleranceMeters || y.gap > touchingToleranceMeters ||
    z.gap > touchingToleranceMeters;
  const overlapping = x.penetration > touchingToleranceMeters &&
    y.penetration > touchingToleranceMeters && z.penetration > touchingToleranceMeters;
  const subjectInsideReference = contains(observation.referenceBounds, observation.subjectBounds);
  const referenceInsideSubject = contains(observation.subjectBounds, observation.referenceBounds);
  const coincident = subjectInsideReference && referenceInsideSubject;
  const spatialState: EnvironmentSpatialState = coincident ? "coincident"
    : subjectInsideReference ? "subject-contained"
    : referenceInsideSubject ? "reference-contained"
    : separated ? "separated"
    : overlapping ? "overlapping"
    : "touching";
  const minimumClearanceMeters = Math.hypot(x.gap, y.gap, z.gap);
  const penetrationDepth = { x: x.penetration, y: y.penetration, z: z.penetration };
  const derivedValues = [
    subject.width, subject.height, subject.depth,
    reference.width, reference.height, reference.depth,
    subject.height / reference.height,
    subject.width / reference.width,
    subject.depth / reference.depth,
    (subject.width * subject.depth) / (reference.width * reference.depth),
    minimumClearanceMeters,
    x.gap, y.gap, z.gap,
    x.penetration, y.penetration, z.penetration,
  ];
  if (derivedValues.some(value => !Number.isFinite(value))) {
    throw new RangeError("Scale/environment measurement exceeds finite numeric range.");
  }

  return {
    schemaVersion: SCALE_ENVIRONMENT_RELATIONSHIP_SCHEMA_VERSION,
    sampleId: observation.sampleId,
    subjectId: observation.subjectId,
    referenceId: observation.referenceId,
    simulationTimeSeconds: observation.simulationTimeSeconds,
    configurationVersion: observation.configurationVersion,
    growthStateId: observation.growthStateId,
    subjectDimensionsMeters: subject,
    referenceDimensionsMeters: reference,
    subjectToReferenceHeightRatio: subject.height / reference.height,
    widthOccupancyRatio: subject.width / reference.width,
    heightOccupancyRatio: subject.height / reference.height,
    depthOccupancyRatio: subject.depth / reference.depth,
    horizontalFootprintOccupancyRatio:
      (subject.width * subject.depth) / (reference.width * reference.depth),
    minimumClearanceMeters,
    axisClearanceMeters: { x: x.gap, y: y.gap, z: z.gap },
    penetrationDepthMeters: penetrationDepth,
    spatialState,
    subjectInsideReference,
    referenceInsideSubject,
  };
}

function metricValue(
  measurement: ScaleEnvironmentRelationshipMeasurement,
  metric: EnvironmentResponseMetric,
): number {
  switch (metric) {
    case "penetrationDepthX": return measurement.penetrationDepthMeters.x;
    case "penetrationDepthY": return measurement.penetrationDepthMeters.y;
    case "penetrationDepthZ": return measurement.penetrationDepthMeters.z;
    default: return measurement[metric];
  }
}

function validateRule(rule: EnvironmentResponseRule): void {
  nonEmpty(rule.ruleId, "ruleId");
  nonEmpty(rule.responseId, "responseId");
  if (![
    "subjectToReferenceHeightRatio", "widthOccupancyRatio", "heightOccupancyRatio",
    "depthOccupancyRatio", "horizontalFootprintOccupancyRatio", "minimumClearanceMeters",
    "penetrationDepthX", "penetrationDepthY", "penetrationDepthZ",
  ].includes(rule.metric)) {
    throw new TypeError(`Rule ${rule.ruleId} has an unsupported metric.`);
  }
  if (rule.operator !== "greater-than-or-equal" && rule.operator !== "less-than-or-equal") {
    throw new TypeError(`Rule ${rule.ruleId} has an unsupported operator.`);
  }
  if (!Number.isFinite(rule.threshold)) throw new RangeError(`Rule ${rule.ruleId} threshold must be finite.`);
  if (rule.releaseThreshold !== undefined && !Number.isFinite(rule.releaseThreshold)) {
    throw new RangeError(`Rule ${rule.ruleId} releaseThreshold must be finite.`);
  }
  if (rule.releaseThreshold !== undefined) {
    if (rule.operator === "greater-than-or-equal" && rule.releaseThreshold > rule.threshold) {
      throw new RangeError(`Rule ${rule.ruleId} releaseThreshold must not exceed threshold.`);
    }
    if (rule.operator === "less-than-or-equal" && rule.releaseThreshold < rule.threshold) {
      throw new RangeError(`Rule ${rule.ruleId} releaseThreshold must not be below threshold.`);
    }
  }
  if (!Number.isSafeInteger(rule.priority) || rule.priority < 0) {
    throw new RangeError(`Rule ${rule.ruleId} priority must be a non-negative integer.`);
  }
  if (![
    "visual-cue", "audio-cue", "interaction-gate",
    "transition-request", "destruction-candidate", "camera-cue",
  ].includes(rule.responseKind)) {
    throw new TypeError(`Rule ${rule.ruleId} has an unsupported responseKind.`);
  }
}

function thresholdMet(value: number, rule: EnvironmentResponseRule, wasActive: boolean): boolean {
  const threshold = wasActive && rule.releaseThreshold !== undefined
    ? rule.releaseThreshold
    : rule.threshold;
  return rule.operator === "greater-than-or-equal" ? value >= threshold : value <= threshold;
}

/** Evaluate declarative response cues; no response is executed by this function. */
export function evaluateScaleEnvironmentResponses(
  measurement: ScaleEnvironmentRelationshipMeasurement,
  rules: EnvironmentResponseRule[],
  previouslyActiveRuleIds: string[] = [],
): ScaleEnvironmentResponseSnapshot {
  if (measurement.schemaVersion !== SCALE_ENVIRONMENT_RELATIONSHIP_SCHEMA_VERSION) {
    throw new TypeError("Unsupported scale/environment measurement schema.");
  }
  if (!Array.isArray(rules)) throw new TypeError("rules must be an array.");
  if (!Array.isArray(previouslyActiveRuleIds) || previouslyActiveRuleIds.some(id => typeof id !== "string" || !id.trim())) {
    throw new TypeError("previouslyActiveRuleIds must contain non-empty strings.");
  }
  const previous = new Set(previouslyActiveRuleIds);
  if (previous.size !== previouslyActiveRuleIds.length) {
    throw new TypeError("previouslyActiveRuleIds must be unique.");
  }
  const seen = new Set<string>();
  const evaluations = rules.map(rule => {
    validateRule(rule);
    if (seen.has(rule.ruleId)) throw new TypeError(`Duplicate environment response rule "${rule.ruleId}".`);
    seen.add(rule.ruleId);
    const wasActive = previous.has(rule.ruleId);
    const value = metricValue(measurement, rule.metric);
    const active = thresholdMet(value, rule, wasActive);
    const state = active ? wasActive ? "maintained" : "entered"
      : wasActive ? "exited" : "inactive";
    return {
      ruleId: rule.ruleId,
      responseKind: rule.responseKind,
      responseId: rule.responseId,
      priority: rule.priority,
      state,
      metric: rule.metric,
      measuredValue: value,
      threshold: rule.threshold,
    } satisfies EnvironmentResponseEvaluation;
  }).sort((a, b) => a.priority - b.priority || a.ruleId.localeCompare(b.ruleId));
  const unknownPrevious = [...previous].filter(id => !seen.has(id));
  if (unknownPrevious.length) {
    throw new TypeError(`Previously active rules are not present in this rule set: ${unknownPrevious.join(", ")}.`);
  }
  const requestedResponses = evaluations.filter(item => item.state === "entered" || item.state === "maintained");
  return {
    schemaVersion: "big3r-scale-environment-response/1.0",
    sampleId: measurement.sampleId,
    subjectId: measurement.subjectId,
    referenceId: measurement.referenceId,
    simulationTimeSeconds: measurement.simulationTimeSeconds,
    configurationVersion: measurement.configurationVersion,
    growthStateId: measurement.growthStateId,
    evaluations,
    requestedResponses,
    authority: {
      physicsExecuted: false,
      environmentMoved: false,
      destructionExecuted: false,
      growthStateModified: false,
      cameraOrPresentationModified: false,
      responseExecuted: false,
    },
  };
}
