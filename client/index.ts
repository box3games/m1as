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
