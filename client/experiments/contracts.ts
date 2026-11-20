/**
 * Versioned, renderer-independent contracts for BIG3R / 13163R experiments.
 *
 * These types describe observations and intent. They do not execute growth,
 * reserve resources, mutate a character, or prescribe a simulation loop.
 */

export const EXPERIMENT_SCHEMA_VERSION = 1 as const;

export type ExperimentId = string;
export type RecordId = string;
export type GrowthRequestId = string;
export type GrowthDecisionId = string;
export type GrowthEventId = string;
export type ResourceTransactionId = string;
export type SweetSpotId = string;
export type HypothesisId = string;

export interface ExperimentTime {
  /** Authoritative comparison clock, in seconds from experiment start. */
  simulationTimeSeconds: number;
  /** Optional wall-clock timestamp; never substitutes for simulation time. */
  wallClockTimeISO?: string;
  frameNumber?: number;
  /** Stable ordering for records emitted at the same simulation time. */
  sequenceNumber: number;
}

export interface ExperimentRecordBase {
  recordId: RecordId;
  experimentId: ExperimentId;
  schemaVersion: typeof EXPERIMENT_SCHEMA_VERSION;
  time: ExperimentTime;
}

export type LengthUnit = string;
export type AngleUnit = "radians";
export type ScreenCoordinateConvention = "normalized_top_left_origin";
export type CoordinateSpace = "world" | "camera" | "screen" | "local";

export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Euler3 {
  x: number;
  y: number;
  z: number;
  unit: AngleUnit;
}

export interface Transform3 {
  position: Vector3;
  rotation: Euler3;
  scale: Vector3;
  coordinateSpace: CoordinateSpace;
}

export interface Bounds2 {
  min: Vector2;
  max: Vector2;
  coordinateSpace: "screen";
}

export interface Bounds3 {
  min: Vector3;
  max: Vector3;
  coordinateSpace: "world" | "local";
  unit: LengthUnit;
}

export type Measurement<T> =
  | { status: "available"; value: T; unit?: string; provenance: string }
  | { status: "unsupported"; reason: string }
  | { status: "not_captured"; reason: string }
  | { status: "failed"; reason: string };

export type GrowthRequestMode = "outcome" | "opportunity";
export type GrowthAmountKind =
  | "relative_change"
  | "absolute_target"
  | "regional_growth"
  | "authored_profile";

export interface RelativeGrowthAmount {
  kind: "relative_change";
  /** Fractional change: 0.2 means +20%, not 0.2 scale units. */
  changeFraction: number;
}

export interface AbsoluteGrowthTarget {
  kind: "absolute_target";
  targetScale: number;
}

export interface RegionalGrowthAmount {
  kind: "regional_growth";
  regionId: string;
  /** Explicitly typed amount; no implicit interpretation of a bare number. */
  amount: RelativeGrowthAmount | AbsoluteGrowthTarget;
}

export interface AuthoredGrowthProfile {
  kind: "authored_profile";
  profileId: string;
  profileVersion: string;
  parameters?: Record<string, number | string | boolean>;
}

export type GrowthAmountComponent =
  | RelativeGrowthAmount
  | AbsoluteGrowthTarget
  | RegionalGrowthAmount
  | AuthoredGrowthProfile;

export type GrowthCompositionPolicy =
  | "additive"
  | "highest_target"
  | "profile_overrides"
  | "authored";

export interface GrowthOutcome {
  components: GrowthAmountComponent[];
  compositionPolicy: GrowthCompositionPolicy;
  /** Optional bounds are explicit constraints, not alternate amount semantics. */
  minimumScale?: number;
  maximumScale?: number;
  durationSeconds?: number;
}

export interface GrowthOpportunity {
  opportunityType: string;
  sourceId?: string;
  context: Record<string, unknown>;
  suggestedOutcome?: GrowthOutcome;
}

export interface GrowthRequestRecord extends ExperimentRecordBase {
  requestId: GrowthRequestId;
  mode: GrowthRequestMode;
  source: string;
  idempotencyKey?: string;
  requestedOutcome?: GrowthOutcome;
  opportunity?: GrowthOpportunity;
}

export type GrowthDecisionStatus =
  | "approved"
  | "partially_approved"
  | "deferred"
  | "rejected";

export interface GrowthDecisionRecord extends ExperimentRecordBase {
  decisionId: GrowthDecisionId;
  requestId: GrowthRequestId;
  status: GrowthDecisionStatus;
  reasonCode: string;
  explanation?: string;
  approvedOutcome?: GrowthOutcome;
  resourceTransactionIds: ResourceTransactionId[];
  reevaluationAfterSeconds?: number;
}

export type GrowthEventLifecycle =
  | "created"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export type GrowthExecutionPolicy =
  | "sequential"
  | "overlapping"
  | "feed_active_chain"
  | "legacy_queue"
  | "custom";

export interface ApprovedGrowthEventRecord extends ExperimentRecordBase {
  eventId: GrowthEventId;
  requestId: GrowthRequestId;
  decisionId: GrowthDecisionId;
  outcome: GrowthOutcome;
  executionPolicy: GrowthExecutionPolicy;
  configurationVersion: string;
}

export interface GrowthExecutionRecord extends ExperimentRecordBase {
  eventId: GrowthEventId;
  status: GrowthEventLifecycle;
  startedAt?: ExperimentTime;
  completedAt?: ExperimentTime;
  initialScale?: Measurement<number>;
  finalScale?: Measurement<number>;
  peakVelocity?: Measurement<number>;
  actualDurationSeconds?: Measurement<number>;
  deviations?: string[];
  /** Legacy observations remain observations; they are not synthetic event records. */
  provenance: "structured_event" | "legacy_observation";
}

export interface CameraViewport {
  widthPixels: number;
  heightPixels: number;
  aspectRatio: number;
}

export interface PerspectiveCameraConfiguration {
  projection: "perspective";
  fovRadians: number;
  nearPlane: number;
  farPlane: number;
}

export interface OrthographicCameraConfiguration {
  projection: "orthographic";
  left: number;
  right: number;
  top: number;
  bottom: number;
  nearPlane: number;
  farPlane: number;
}

export type CameraProjectionConfiguration =
  | PerspectiveCameraConfiguration
  | OrthographicCameraConfiguration;

export interface CameraConfigurationSnapshot {
  cameraRole: string;
  projection: CameraProjectionConfiguration;
  transform: Transform3;
  target?: Vector3;
  orbitPivot?: Vector3;
  followOffset?: Vector3;
  viewport: CameraViewport;
  framing?: Record<string, unknown>;
  visibility?: Record<string, boolean>;
  authoredConfigurationVersion: string;
}

export interface CameraRuntimeState {
  projection: CameraProjectionConfiguration;
  transform: Transform3;
  target?: Vector3;
  orbitPivot?: Vector3;
  followOffset?: Vector3;
  viewport: CameraViewport;
  cameraMode?: string;
}

export interface CharacterRegionSample {
  regionId: string;
  worldBounds: Measurement<Bounds3>;
  localBounds: Measurement<Bounds3>;
  visible: Measurement<boolean>;
  landmarkPositions?: Record<string, Measurement<Vector3>>;
}

export interface CharacterPresentationSample {
  rootTransform: Measurement<Transform3>;
  worldBounds: Measurement<Bounds3>;
  screenBounds: Measurement<Bounds2>;
  screenOccupancy: Measurement<number>;
  posture: Measurement<string>;
  orientation: Measurement<Euler3>;
  visible: Measurement<boolean>;
  regions: CharacterRegionSample[];
  animationState?: Measurement<string>;
  deformationState?: Measurement<Record<string, number>>;
  vfxState?: Measurement<Record<string, unknown>>;
}

export interface WorldLandmarkSample {
  landmarkId: string;
  kind: string;
  worldTransform: Measurement<Transform3>;
  worldBounds: Measurement<Bounds3>;
  screenBounds: Measurement<Bounds2>;
  visible: Measurement<boolean>;
  representationTier?: Measurement<string>;
}

export interface ScreenPresentationSample {
  viewport: CameraViewport;
  characterBounds: Measurement<Bounds2>;
  characterOccupancy: Measurement<number>;
  viewportEdgeContact: Measurement<Record<string, boolean>>;
  occlusion: Measurement<Record<string, number>>;
  landmarkRatios: Record<string, Measurement<number>>;
}

export interface PresentationSampleRecord extends ExperimentRecordBase {
  sampleId: RecordId;
  cameraConfiguration: Measurement<CameraConfigurationSnapshot>;
  cameraRuntime: Measurement<CameraRuntimeState>;
  character: CharacterPresentationSample;
  worldLandmarks: WorldLandmarkSample[];
  screen: ScreenPresentationSample;
  relatedRequestIds: GrowthRequestId[];
  relatedDecisionIds: GrowthDecisionId[];
  relatedEventIds: GrowthEventId[];
}

export const PERCEPTION_MILESTONES = [
  "did_i_grow",
  "maybe_i_grew",
  "i_grew",
  "i_got_bigger",
  "grew_some_more",
  "did_not_think_i_was_going_to_grow_again",
  "oh_wait_am_i_still_growing",
  "when_will_i_stop_growing",
  "i_cant_believe_i_am_that_big",
  "i_am_big3r",
] as const;

export type PerceptionMilestone = (typeof PERCEPTION_MILESTONES)[number];
export type PerceptionObserverType = "tester" | "developer" | "automated_metric";

export interface PerceptionAnnotationRecord extends ExperimentRecordBase {
  annotationId: RecordId;
  observerType: PerceptionObserverType;
  milestone?: PerceptionMilestone;
  customLabel?: string;
  rating?: number;
  comment?: string;
  relatedSampleIds: RecordId[];
  relatedEventIds: GrowthEventId[];
}

export type HypothesisKind = "growth" | "presentation" | "perception" | "combined";

export interface PresentationHypothesis {
  intendedEffect: string;
  conditions: Record<string, unknown>;
  automatedIndicators: string[];
  humanAnnotations: string[];
  failureIndicators: string[];
}

export interface ExperimentHypothesisRecord extends ExperimentRecordBase {
  hypothesisId: HypothesisId;
  kind: HypothesisKind;
  statement: string;
  presentation?: PresentationHypothesis;
  successCriteria: string[];
  failureCriteria: string[];
}

export type CaptureProfileName = "lightweight" | "detailed" | "discovery";
export type CaptureMode = "snapshot" | "keyframe" | "continuous";

export interface CaptureProfile {
  name: CaptureProfileName;
  mode: CaptureMode;
  sampleIntervalSeconds?: number;
  frameInterval?: number;
  eventTriggers: string[];
  preEventWindowSeconds: number;
  postEventWindowSeconds: number;
  includeCamera: boolean;
  includeCharacter: boolean;
  includeWorldLandmarks: boolean;
  includeScreenSpace: boolean;
  includePerception: boolean;
}

export type SweetSpotConfidence =
  | "unverified"
  | "observed"
  | "repeatable"
  | "validated";

export type SweetSpotEvidenceOutcome =
  | "failed"
  | "partial"
  | "successful"
  | "inconclusive";

export interface SweetSpotParameterDefinition {
  parameterId: string;
  valueType: "number" | "integer" | "boolean" | "string" | "vector3";
  unit?: string;
  minimum?: number;
  maximum?: number;
  allowedValues?: Array<string | number | boolean>;
  required: boolean;
}

export interface SweetSpotRecipe {
  sweetSpotId: SweetSpotId;
  name: string;
  version: string;
  intendedEffect: string;
  cameraConfigurationRef: string;
  growthConfigurationRef: string;
  characterConfigurationRef: string;
  worldConfigurationRef: string;
  compatibility: Record<string, unknown>;
  parameters: SweetSpotParameterDefinition[];
  parameterValues: Record<string, unknown>;
  parentSweetSpotId?: SweetSpotId;
}

export interface SweetSpotEvidenceRecord extends ExperimentRecordBase {
  sweetSpotId: SweetSpotId;
  outcome: SweetSpotEvidenceOutcome;
  confidence: SweetSpotConfidence;
  hypothesisId?: HypothesisId;
  experimentIds: ExperimentId[];
  notes?: string;
}

export interface ExperimentManifest {
  experimentId: ExperimentId;
  schemaVersion: typeof EXPERIMENT_SCHEMA_VERSION;
  createdAtISO: string;
  title: string;
  description?: string;
  buildVersion: string;
  configurationVersion: string;
  randomSeed?: number;
  timestepSeconds?: number;
  worldUnit: LengthUnit;
  screenCoordinateConvention: ScreenCoordinateConvention;
  captureProfile: CaptureProfile;
  configurationRefs: {
    character: string;
    growth: string;
    camera: string;
    world: string;
  };
  artifactHashes?: Record<string, string>;
}
