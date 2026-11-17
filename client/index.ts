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
