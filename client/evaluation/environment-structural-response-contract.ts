/**
 * Renderer-neutral structural response evaluation.
 *
 * BIG3R, VFXR, and other capable pipelines can consume the same response events.
 * Physical load/stress values must be supplied by an authoritative source; AABB
 * overlap alone is never treated as proof of force, damage, or fracture.
 */
import type {
  ScaleEnvironmentRelationshipMeasurement,
} from "./scale-environment-relationship-contract.js";

export const ENVIRONMENT_STRUCTURAL_RESPONSE_SCHEMA_VERSION =
  "big3r-environment-structural-response/1.0" as const;

export type StructuralSignalMetric =
  | "subjectToReferenceHeightRatio"
  | "widthOccupancyRatio"
  | "heightOccupancyRatio"
  | "depthOccupancyRatio"
  | "horizontalFootprintOccupancyRatio"
  | "minimumClearanceMeters"
  | "penetrationDepthX"
  | "penetrationDepthY"
  | "penetrationDepthZ"
  | "stressRatio"
  | "strainRatio"
  | "damageRatio"
  | "contactDurationSeconds"
  | "impactEnergyJoules";

export interface StructuralSignalValue {
  status: "available";
  value: number;
  unit: "ratio" | "meters" | "seconds" | "joules";
  source: string;
  confidence: "measured" | "estimated" | "authored";
}

export type StructuralSignal =
  | StructuralSignalValue
  | { status: "not_captured" | "unsupported" | "failed"; reason: string };

export interface StructuralSignalSet {
  stressRatio?: StructuralSignal;
  strainRatio?: StructuralSignal;
  damageRatio?: StructuralSignal;
  contactDurationSeconds?: StructuralSignal;
  impactEnergyJoules?: StructuralSignal;
}

export interface StructuralResponseObservation {
  observationId: string;
  relationship: ScaleEnvironmentRelationshipMeasurement;
  signals: StructuralSignalSet;
  provenance: {
    sourceId: string;
    sourceVersion: string;
    sourceKind: "physics-solver" | "structural-solver" | "authored-envelope" | "procedural-estimate";
  };
}

export type StructuralResponseChannel =
  | "visual-effect"
  | "audio-effect"
  | "physics"
  | "structural-integrity"
  | "world-transition";

export type StructuralResponseEffectKind =
  | "contact-flash"
  | "impact-flash"
  | "stress-glow"
  | "crack-overlay"
  | "fracture-preview"
  | "dust-overlay"
  | "debris-overlay"
  | "sprite-sequence"
  | "webm-overlay"
  | "procedural-overlay"
  | "particle-layer"
  | "audio-cue"
  | "displacement-request"
  | "damage-evaluation"
  | "failure-evaluation"
  | "transition-candidate";

export type StructuralResponseSeverity = "info" | "warning" | "critical";

export interface StructuralResponseAssetReference {
  kind: "sprite-sequence" | "webm" | "effect-preset" | "procedural";
  assetId: string;
  variant?: string;
}

export interface StructuralResponseRule {
  ruleId: string;
  metric: StructuralSignalMetric;
  operator: "greater-than-or-equal" | "less-than-or-equal";
  threshold: number;
  releaseThreshold?: number;
  channel: StructuralResponseChannel;
  effectKind: StructuralResponseEffectKind;
  responseId: string;
  severity: StructuralResponseSeverity;
  priority: number;
  /** Optional VFXR/BIG3R target identity; never inferred from the asset. */
  targetId?: string;
  asset?: StructuralResponseAssetReference;
}

export type StructuralRuleState =
  | "entered" | "maintained" | "exited" | "inactive"
  | "unavailable";

export interface StructuralResponseEvent {
  schemaVersion: typeof ENVIRONMENT_STRUCTURAL_RESPONSE_SCHEMA_VERSION;
  eventId: string;
  ruleId: string;
  responseId: string;
  observationId: string;
  subjectId: string;
  referenceId: string;
  growthStateId: string;
  configurationVersion: string;
  simulationTimeSeconds: number;
  channel: StructuralResponseChannel;
  effectKind: StructuralResponseEffectKind;
  severity: StructuralResponseSeverity;
  priority: number;
  metric: StructuralSignalMetric;
  measuredValue: number;
  threshold: number;
  confidence: "measured" | "estimated" | "authored" | "relationship-derived";
  targetId?: string;
  asset?: StructuralResponseAssetReference;
}

export interface StructuralRuleEvaluation {
  ruleId: string;
  state: StructuralRuleState;
  metric: StructuralSignalMetric;
  measuredValue?: number;
  threshold: number;
  reason?: string;
  event?: StructuralResponseEvent;
}

export interface StructuralResponseEvaluation {
  schemaVersion: typeof ENVIRONMENT_STRUCTURAL_RESPONSE_SCHEMA_VERSION;
  observationId: string;
  subjectId: string;
  referenceId: string;
  growthStateId: string;
  configurationVersion: string;
  simulationTimeSeconds: number;
  evaluations: StructuralRuleEvaluation[];
  events: StructuralResponseEvent[];
  authority: {
    physicalLoadApplied: false;
    structuralDamageApplied: false;
    destructionExecuted: false;
    visualEffectExecuted: false;
    audioEffectExecuted: false;
    growthStateModified: false;
    cameraOrPresentationModified: false;
  };
}

function nonEmpty(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required.`);
}

function relationshipMetric(
  measurement: ScaleEnvironmentRelationshipMeasurement,
  metric: StructuralSignalMetric,
): { value: number; confidence: "relationship-derived" } | undefined {
  switch (metric) {
    case "subjectToReferenceHeightRatio":
    case "widthOccupancyRatio":
    case "heightOccupancyRatio":
    case "depthOccupancyRatio":
    case "horizontalFootprintOccupancyRatio":
    case "minimumClearanceMeters":
      return { value: measurement[metric], confidence: "relationship-derived" };
    case "penetrationDepthX":
      return { value: measurement.penetrationDepthMeters.x, confidence: "relationship-derived" };
    case "penetrationDepthY":
      return { value: measurement.penetrationDepthMeters.y, confidence: "relationship-derived" };
    case "penetrationDepthZ":
      return { value: measurement.penetrationDepthMeters.z, confidence: "relationship-derived" };
    default:
      return undefined;
  }
}

function structuralSignal(
  signals: StructuralSignalSet,
  metric: StructuralSignalMetric,
): StructuralSignal | undefined {
  switch (metric) {
    case "stressRatio": return signals.stressRatio;
    case "strainRatio": return signals.strainRatio;
    case "damageRatio": return signals.damageRatio;
    case "contactDurationSeconds": return signals.contactDurationSeconds;
    case "impactEnergyJoules": return signals.impactEnergyJoules;
    default: return undefined;
  }
}

function expectedSignalUnit(metric: StructuralSignalMetric): StructuralSignalValue["unit"] | undefined {
  if (metric === "stressRatio" || metric === "strainRatio" || metric === "damageRatio") return "ratio";
  if (metric === "contactDurationSeconds") return "seconds";
  if (metric === "impactEnergyJoules") return "joules";
  return undefined;
}

function resolveStructuralSignal(
  signal: StructuralSignal | undefined,
  expectedUnit: StructuralSignalValue["unit"] | undefined,
): { value: number; confidence: StructuralSignalValue["confidence"] } | undefined {
  if (!signal || signal.status !== "available" || !expectedUnit) return undefined;
  if (!Number.isFinite(signal.value) || signal.value < 0 || signal.unit !== expectedUnit ||
      typeof signal.source !== "string" || !signal.source.trim() ||
      !["measured", "estimated", "authored"].includes(signal.confidence)) return undefined;
  return { value: signal.value, confidence: signal.confidence };
}

function validateRule(rule: StructuralResponseRule): void {
  nonEmpty(rule.ruleId, "ruleId");
  nonEmpty(rule.responseId, "responseId");
  if (![
    "subjectToReferenceHeightRatio", "widthOccupancyRatio", "heightOccupancyRatio",
    "depthOccupancyRatio", "horizontalFootprintOccupancyRatio", "minimumClearanceMeters",
    "penetrationDepthX", "penetrationDepthY", "penetrationDepthZ", "stressRatio",
    "strainRatio", "damageRatio", "contactDurationSeconds", "impactEnergyJoules",
  ].includes(rule.metric)) throw new TypeError(`Rule ${rule.ruleId} has an unsupported metric.`);
  if (!["info", "warning", "critical"].includes(rule.severity)) {
    throw new TypeError(`Rule ${rule.ruleId} has an unsupported severity.`);
  }
  if (!Number.isFinite(rule.threshold)) throw new RangeError(`Rule ${rule.ruleId} threshold must be finite.`);
  if (rule.releaseThreshold !== undefined && !Number.isFinite(rule.releaseThreshold)) {
    throw new RangeError(`Rule ${rule.ruleId} releaseThreshold must be finite.`);
  }
  if (rule.releaseThreshold !== undefined &&
      ((rule.operator === "greater-than-or-equal" && rule.releaseThreshold > rule.threshold) ||
       (rule.operator === "less-than-or-equal" && rule.releaseThreshold < rule.threshold))) {
    throw new RangeError(`Rule ${rule.ruleId} releaseThreshold is on the wrong side of threshold.`);
  }
  if (rule.operator !== "greater-than-or-equal" && rule.operator !== "less-than-or-equal") {
    throw new TypeError(`Rule ${rule.ruleId} has an unsupported operator.`);
  }
  if (!Number.isSafeInteger(rule.priority) || rule.priority < 0) {
    throw new RangeError(`Rule ${rule.ruleId} priority must be a non-negative integer.`);
  }
  if (!["visual-effect", "audio-effect", "physics", "structural-integrity", "world-transition"].includes(rule.channel)) {
    throw new TypeError(`Rule ${rule.ruleId} has an unsupported channel.`);
  }
  if (![
    "contact-flash", "impact-flash", "stress-glow", "crack-overlay", "fracture-preview",
    "dust-overlay", "debris-overlay", "sprite-sequence", "webm-overlay", "procedural-overlay",
    "particle-layer", "audio-cue", "displacement-request", "damage-evaluation",
    "failure-evaluation", "transition-candidate",
  ].includes(rule.effectKind)) {
    throw new TypeError(`Rule ${rule.ruleId} has an unsupported effectKind.`);
  }
  if (rule.targetId !== undefined) nonEmpty(rule.targetId, "targetId");
  if (rule.asset) {
    nonEmpty(rule.asset.assetId, "asset.assetId");
    if (!["sprite-sequence", "webm", "effect-preset", "procedural"].includes(rule.asset.kind)) {
      throw new TypeError(`Rule ${rule.ruleId} has an unsupported asset kind.`);
    }
  }
}

function thresholdMet(value: number, rule: StructuralResponseRule, wasActive: boolean): boolean {
  const threshold = wasActive && rule.releaseThreshold !== undefined
    ? rule.releaseThreshold : rule.threshold;
  return rule.operator === "greater-than-or-equal" ? value >= threshold : value <= threshold;
}

/**
 * Evaluates structural response thresholds and emits portable events.
 * It never infers force/stress from visual overlap and never executes a response.
 */
export function evaluateStructuralResponses(
  observation: StructuralResponseObservation,
  rules: StructuralResponseRule[],
  previouslyActiveRuleIds: string[] = [],
): StructuralResponseEvaluation {
  if (!observation || typeof observation !== "object") throw new TypeError("Observation is required.");
  nonEmpty(observation.observationId, "observationId");
  nonEmpty(observation.provenance?.sourceId, "provenance.sourceId");
  nonEmpty(observation.provenance?.sourceVersion, "provenance.sourceVersion");
  if (!["physics-solver", "structural-solver", "authored-envelope", "procedural-estimate"].includes(observation.provenance.sourceKind)) {
    throw new TypeError("provenance.sourceKind is unsupported.");
  }
  if (!observation.relationship ||
      observation.relationship.schemaVersion !== "big3r-scale-environment-relationship/1.0") {
    throw new TypeError("A supported scale/environment relationship measurement is required.");
  }
  if (!Array.isArray(rules) || !Array.isArray(previouslyActiveRuleIds)) {
    throw new TypeError("rules and previouslyActiveRuleIds must be arrays.");
  }
  const previous = new Set(previouslyActiveRuleIds);
  if (previous.size !== previouslyActiveRuleIds.length ||
      previouslyActiveRuleIds.some(id => typeof id !== "string" || !id.trim())) {
    throw new TypeError("Previously active rule IDs must be unique non-empty strings.");
  }
  const seen = new Set<string>();
  const evaluations = rules.map(rule => {
    validateRule(rule);
    if (seen.has(rule.ruleId)) throw new TypeError(`Duplicate structural response rule "${rule.ruleId}".`);
    seen.add(rule.ruleId);
    const prior = previous.has(rule.ruleId);
    const relation = relationshipMetric(observation.relationship, rule.metric);
    const signal = relation ? undefined : structuralSignal(observation.signals ?? {}, rule.metric);
    const resolvedSignal = resolveStructuralSignal(signal, expectedSignalUnit(rule.metric));
    const resolved = relation
      ? { ...relation, status: "available" as const }
      : resolvedSignal
        ? { ...resolvedSignal, status: "available" as const }
        : undefined;
    if (!resolved) {
      const reason = signal && signal.status !== "available"
        ? signal.reason
        : signal?.status === "available"
          ? `Metric ${rule.metric} has invalid value, unit, source, or confidence metadata.`
          : `Metric ${rule.metric} has not been captured by the supplied authority.`;
      return { ruleId: rule.ruleId, state: "unavailable" as const, metric: rule.metric,
        threshold: rule.threshold, reason } satisfies StructuralRuleEvaluation;
    }
    if (!Number.isFinite(resolved.value)) {
      return { ruleId: rule.ruleId, state: "unavailable" as const, metric: rule.metric,
        threshold: rule.threshold, reason: "Structural signal value is not finite." } satisfies StructuralRuleEvaluation;
    }
    const active = thresholdMet(resolved.value, rule, prior);
    const state: StructuralRuleState = active ? prior ? "maintained" : "entered"
      : prior ? "exited" : "inactive";
    const event: StructuralResponseEvent | undefined = active ? {
      schemaVersion: ENVIRONMENT_STRUCTURAL_RESPONSE_SCHEMA_VERSION,
      eventId: `${observation.observationId}:${rule.ruleId}`,
      ruleId: rule.ruleId,
      responseId: rule.responseId,
      observationId: observation.observationId,
      subjectId: observation.relationship.subjectId,
      referenceId: observation.relationship.referenceId,
      growthStateId: observation.relationship.growthStateId,
      configurationVersion: observation.relationship.configurationVersion,
      simulationTimeSeconds: observation.relationship.simulationTimeSeconds,
      channel: rule.channel,
      effectKind: rule.effectKind,
      severity: rule.severity,
      priority: rule.priority,
      metric: rule.metric,
      measuredValue: resolved.value,
      threshold: rule.threshold,
      confidence: resolved.confidence,
      ...(rule.targetId ? { targetId: rule.targetId } : {}),
      ...(rule.asset ? { asset: { ...rule.asset } } : {}),
    } : undefined;
    return {
      ruleId: rule.ruleId, state, metric: rule.metric, measuredValue: resolved.value,
      threshold: rule.threshold, ...(event ? { event } : {}),
    } satisfies StructuralRuleEvaluation;
  }).sort((a, b) => {
    const ar = rules.find(rule => rule.ruleId === a.ruleId)!;
    const br = rules.find(rule => rule.ruleId === b.ruleId)!;
    return ar.priority - br.priority || a.ruleId.localeCompare(b.ruleId);
  });
  const unknownPrevious = [...previous].filter(id => !seen.has(id));
  if (unknownPrevious.length) {
    throw new TypeError(`Previously active structural rules are absent: ${unknownPrevious.join(", ")}.`);
  }
  const events = evaluations.flatMap(item => ("event" in item && item.event) ? [item.event] : []);
  const relationship = observation.relationship;
  return {
    schemaVersion: ENVIRONMENT_STRUCTURAL_RESPONSE_SCHEMA_VERSION,
    observationId: observation.observationId,
    subjectId: relationship.subjectId,
    referenceId: relationship.referenceId,
    growthStateId: relationship.growthStateId,
    configurationVersion: relationship.configurationVersion,
    simulationTimeSeconds: relationship.simulationTimeSeconds,
    evaluations,
    events,
    authority: {
      physicalLoadApplied: false,
      structuralDamageApplied: false,
      destructionExecuted: false,
      visualEffectExecuted: false,
      audioEffectExecuted: false,
      growthStateModified: false,
      cameraOrPresentationModified: false,
    },
  };
}
