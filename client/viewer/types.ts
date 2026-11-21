import type { GrowthEvent } from "../GrowthEventQueue.js";
import type { FaceAssetType } from "../M1ASFaceSurfaceResolver.js";

export interface AssetCapabilities {
    canPreview?: boolean;
    canStream?: boolean;
}

export interface M1asAsset {
    id: string;
    displayName: string;
    mimeType: string;
    size: number;
    capabilities?: AssetCapabilities;
}

export interface SignedUrlResponse {
    url: string;
    expires: number;
    ttl: number;
}

export type GrowthMode = "click" | "tap" | "hold" | "chaos-delayed";
export type GrowthModelMode = "m1as-vfx" | "baseline-scale";
export type StimulusType = "Consumption" | "Exercise" | "Buff" | "Environmental";
export type PropRole = "consumable" | "wearable" | "container" | "growth-gate" | "reference";
export type PostureState = "stand" | "hunch" | "crawl";

export interface SpatialProp {
    id: string;
    name?: string;
    role: PropRole;
    targetHeight: number;
    broken: boolean;
}

export interface SpatialPropOptions {
    name?: string;
    role: PropRole;
    targetHeight: number;
    x: number;
    z: number;
}

export interface VfxGrowthState {
    boxTier: number;
    currentScale: number;
    posture: PostureState;
    occupancyRatio: number;
    storedGoldenBuffer: number;
    hasSkeleton: boolean;
    boneCount: number;
}

export interface VfxEngineOptions {
    userId: string;
    moveSpeed: number;
    baseScale: number;
    initialRoomCeiling: number;
    cinematicCamera: boolean;
    onPropsChanged: (props: SpatialProp[]) => void;
    onStateChange: (state: VfxGrowthState) => void;
    onRoomCollapse: (newBoxTier: number, newCeiling: number) => void;
    onFrame?: (simulationTimeSeconds: number, frameNumber: number) => void;
    onGrowthQueued?: (simulationTimeSeconds: number, frameNumber: number) => void;
    onGrowthReleased?: (event: GrowthEvent, simulationTimeSeconds: number, frameNumber: number) => void;
    onDiagnostic?: (level: "info" | "warn" | "error", category: string, message: string, data?: Record<string, unknown>) => void;
}

export type FaceSlotKey = "bg" | number;

export type PropClickActionType =
    | "growth"
    | "audio"
    | "vfx-burst"
    | "box-transition"
    | "injector-drain";

export interface PropClickTrigger {
    action: PropClickActionType;
    signedUrl?: string;
    growthAmount?: number;
    stimulus?: StimulusType;
}

export interface PropVfxLayerOptions {
    webmUrl: string;
    scaleMultiplier?: number;
    emissiveColor?: string;
    emissiveIntensity?: number;
    isInjectorDrain?: boolean;
    drainGrowthAmount?: number;
}

export interface Big3rRoomSlotPreset {
    slot: FaceSlotKey;
    assetType: FaceAssetType;
    value: string;
    label?: string;
}

export interface Big3rPropPreset {
    id: string;
    glbUrl: string;
    name: string;
    role: PropRole;
    targetHeight: number;
    x: number;
    z: number;
    overlay?: PropVfxLayerOptions;
    clickTrigger?: PropClickTrigger;
}

export interface Big3rStagePreset {
    version: 1;
    boxTier: number;
    roomCeilingHeight: number;
    doubleSidedRoom: boolean;
    roomSlots: Big3rRoomSlotPreset[];
    props: Big3rPropPreset[];
}

export interface IVfxEngine {
    setMode(mode: GrowthMode): void;
    getGrowthModel?(): GrowthModelMode;
    setGrowthModel?(mode: GrowthModelMode): boolean;
    enqueueGrowth(amount: number, stimulus: StimulusType): void;
    startHoldGrowth(): void;
    releaseHoldGrowth(): void;
    triggerDelayedColossalChaos(delaySec: number, multiplier: number): void;
    resetGrowth(): void;
    setRoomCeiling(meters: number): void;
    setCinematicCamera(enabled: boolean): void;
    addSpatialProp(url: string, options: SpatialPropOptions): Promise<string | void>;
    updatePropHeight(id: string, height: number): void;
    removeProp(id: string): void;
    resetAllProps(): void;
    setVfxWebm(url: string): Promise<void>;
    setTransparentBackground(enabled: boolean): void;
    getCanvas(): HTMLCanvasElement;
    destroy(): void;
}


export type VfxEngineFactory = (
    canvas: HTMLCanvasElement,
    glbBlobUrl: string,
    options: VfxEngineOptions
) => IVfxEngine | Promise<IVfxEngine>;

export interface IFaceLayerEngine {
    updateBackground(assetType: string, value: string, label?: string): Promise<void> | void;
    updateFace(slot: number, assetType: string, value: string, label?: string): Promise<void> | void;
    setClickVfx(webmUrl: string): Promise<void>;
    setTransparentBackground(enabled: boolean): void;
    getCanvas(): HTMLCanvasElement;
    destroy(): void;
}

export type FaceLayerEngineFactory = (
    canvas: HTMLCanvasElement,
    glbBlobUrl: string
) => IFaceLayerEngine | Promise<IFaceLayerEngine>;

