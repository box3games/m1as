export { M1ASVFXEngine } from './M1ASVFXEngine.js';
export { M1ASFaceLayerEngine } from './M1ASFaceLayerEngine.js';
export {
  M1ASFaceSurfaceResolver,
  type FaceAssetType,
  type AudioSurfaceSlot,
} from './M1ASFaceSurfaceResolver.js';
export {
  resolveM1ASTexture,
  disposeSharedTextureResolver,
  type ManagedTextureHandle,
  type ResolveTextureOptions,
} from './textures/ResolveM1ASTexture.js';
export type {
  AssetCapabilities,
  M1asAsset,
  SignedUrlResponse,
  GrowthMode,
  GrowthModelMode,
  StimulusType,
  PropRole,
  PostureState,
  SpatialProp,
  SpatialPropOptions,
  VfxGrowthState,
  VfxEngineOptions,
  IVfxEngine,
  VfxEngineFactory,
  FaceSlotKey,
  IFaceLayerEngine,
  FaceLayerEngineFactory,
} from './viewer/types.js';

export type * from './experiments/contracts.js';
export { ExperimentRecorder, type ExperimentStorage, type ExperimentClock, type ExperimentRecorderOptions } from './experiments/recorder.js';
export { ExperimentTimeline } from './experiments/timeline.js';
export { DEFAULT_CAPTURE_PROFILES } from './experiments/capture-profiles.js';
export {
  validateNormalizedRect,
  validateGrowthOutcome,
  validateGrowthRequest,
  validateCaptureProfile,
  validateExperimentManifest,
  validateSweetSpotRecipe,
  type ValidationIssue,
  type ValidationResult,
} from './experiments/validation.js';
export {
  observeLegacyQueueRelease,
  createSyntheticHarnessRequest,
  legacyReleaseToExecutionObservation,
  type LegacyQueueReleaseObservation,
} from './experiments/legacy-adapters.js';
export { capturePerspectiveCamera, captureCharacterPresentation, captureWorldLandmark } from './experiments/three-adapters.js';

export { CaptureScheduler, type CaptureTrigger } from './experiments/capture-scheduler.js';
export { ExperimentCoordinator, type ExperimentCoordinatorOptions, type PresentationSamplePayload } from './experiments/coordinator.js';

export { BrowserDownloadExperimentStorage } from './experiments/browser-download-storage.js';

export {
  GrowTimeController,
  LocalStorageGrowTimeStore,
  DEFAULT_GROW_TIME_CONFIG,
  DEFAULT_GROW_TIME_INPUTS,
  type GrowTimeConfig,
  type GrowTimeState,
  type GrowTimeSnapshot,
  type GrowTimeStore,
  type GrowTimeConsumptionPolicy,
  type GrowTimeConversionMode,
} from "./growth/grow-time.js";

export { DiagnosticLogger, createBrowserDiagnosticLogger, type DiagnosticRecord, type DiagnosticLevel } from "./experiments/diagnostic-logger.js";
export { IndexedDbExperimentStorage } from "./experiments/indexeddb-storage.js";
export { MultiTargetExperimentStorage } from "./experiments/multi-target-storage.js";
export { type GrowthModel, type GrowthModelId, type GrowthModelDescriptor, type GrowthModelCapabilities, type GrowthModelSubject, type GrowthModelContext, type GrowthModelCommand, type GrowthModelResult, type GrowthModelTelemetry } from "./growth/model-contract.js";

export { ThreeObjectScaleGrowthModel, M1ASVFXGrowthModel } from "./growth/model-adapters.js";
export { TwoDimensionalSpriteGrowthModel } from "./growth/two-dimensional-sprite-growth-model.js";
export {
  TWO_D_SPRITE_EXPERIMENT_SCHEMA_VERSION,
  TwoDimensionalSpriteExperimentRunner,
  parseTwoDimensionalSpriteExperimentConfig,
  validateTwoDimensionalSpriteExperimentConfig,
} from "./growth/two-dimensional-sprite-experiment-runner.js";
export type {
  TwoDimensionalSpriteExperimentConfig,
  TwoDimensionalSpriteExperimentEvent,
  TwoDimensionalSpriteExperimentAction,
  TwoDimensionalSpriteExperimentSample,
  TwoDimensionalSpriteExperimentResult,
  SpriteExperimentValidationIssue,
  SpriteExperimentValidationResult,
} from "./growth/two-dimensional-sprite-experiment-runner.js";

export {
  validateCharacterPresentationMotionProfile,
  validateMotionRigCapabilities,
  resolveCharacterMotionIntents,
} from "./animation/presentation-motion-contract.js";
export type * from "./animation/presentation-motion-contract.js";

export {
  buildCharacterRigTopology,
  validateCharacterRigTopology,
  inspectCharacterAnimationCapabilities,
  type CharacterAnimationCapabilityReport,
  type CharacterAnimationClipCapability,
  type AuthoredCharacterRegionMapping,
  type CharacterRigBoneNode,
} from "./animation/character-animation-capability-adapter.js";

export {
  DeformationIntegrityMonitor,
  type CharacterIntegrityDetector,
  type IntegrityDetectorContext,
  type IntegrityDetectorResult,
  type IntegrityGeometrySubject,
  type DeformationIntegrityReport,
} from "./animation/deformation-integrity-monitor.js";

export {
  AabbBroadPhaseIntegrityDetector,
} from "./animation/deformation-integrity-monitor.js";


export {
  CHARACTER_BODY_ARCHITECTURE_SCHEMA_VERSION,
  CHARACTER_BODY_ARCHETYPE_SCHEMA_VERSION,
  BODY_ARCHETYPE_REGISTRY_SCHEMA_VERSION,
  STANDARD_ANATOMICAL_REGION_IDS,
  createAnatomicalRegionId,
  validateAnatomicalVocabulary,
  validateCharacterBodyProfile,
  validateCharacterBodyIdentity,
  validateCharacterBodyStateSnapshot,
  validateCharacterDevelopmentHistory,
  validateCharacterBodyArchetype,
  instantiateCharacterBodyArchetype,
  validateBodyArchetypeRegistry,
  CharacterBodyArchetypeRegistry,
  serializeBodyArchetypeRegistry,
  parseBodyArchetypeRegistry,
} from "./character/body-architecture-contract.js";
export type * from "./character/body-architecture-contract.js";

export {
  PortableEvaluationRouter,
  type PortableEvaluationDomain,
  type PortableJsonValue,
  type PortableEvaluationSubject,
  type PortableEvaluationContext,
  type PortableEvaluationCommand,
  type PortableCapabilityStatus,
  type PortableDomainCapability,
  type PortableEngineDescriptor,
  type PortableTranslationResult,
  type PortableAdapterExecution,
  type PortableEngineAdapter,
  type PortableExecutionStatus,
  type PortableExecutionRecord,
} from "./evaluation/portable-evaluation-router.js";
export { GrowthModelPortableAdapter } from "./evaluation/growth-model-portable-adapter.js";
export { Big3rStagePresentationAdapter, type Big3rStagePresentationPort } from "./evaluation/big3r-stage-presentation-adapter.js";

export {
  validatePortableAnchorSnapshot,
  measureScaleRelationship,
} from "./evaluation/portable-anchor-contract.js";
export type * from "./evaluation/portable-anchor-contract.js";

export {
  validateCameraAttachmentConfiguration,
  validateCameraPerspectiveSnapshot,
  validateSynchronizedPerspectiveCapture,
} from "./evaluation/camera-perspective-contract.js";
export type * from "./evaluation/camera-perspective-contract.js";


export {
  validateRendererCapabilityDescriptor,
  getRendererCapabilityStatus,
} from "./evaluation/renderer-capability-contract.js";
export type * from "./evaluation/renderer-capability-contract.js";

export {
  validateInfinityGrowthPresentation,
  validateFramingIntegrityAssessment,
  validateGrowthPresentationTransition,
} from "./evaluation/infinity-growth-presentation-contract.js";
export type * from "./evaluation/infinity-growth-presentation-contract.js";

export {
  validateScaleReferenceHierarchy,
  promoteScaleParent,
} from "./evaluation/scale-reference-hierarchy-contract.js";
export type * from "./evaluation/scale-reference-hierarchy-contract.js";

export { assessFramingIntegrity } from "./evaluation/framing-integrity-monitor.js";
export type * from "./evaluation/framing-integrity-monitor.js";
