import {
    GrowthMode,
    IVfxEngine,
    PropRole,
    SpatialProp,
    StimulusType,
    VfxEngineFactory,
    VfxGrowthState
} from "../viewer/types.js";

import type { M1ASVFXEngine } from "../M1ASVFXEngine.js";
import { GrowthStimulusType } from "../GrowthEventQueue.js";
import { Big3rStageCoordinator } from "../big3r/Big3rStageCoordinator.js";
import type { FaceAssetType } from "../M1ASFaceSurfaceResolver.js";
import type { JSONLevelManifest } from "../big3r/streaming/manifest-types.js";
import type { CameraRigMode } from "../big3r/camera/CameraRig5Mode.js";
import type { Big3rStagePreset, FaceSlotKey } from "./types.js";
import { EXPERIMENT_SCHEMA_VERSION } from "../experiments/contracts.js";
import type { ExperimentManifest, GrowthOutcome } from "../experiments/contracts.js";
import { DEFAULT_CAPTURE_PROFILES } from "../experiments/capture-profiles.js";
import { ExperimentCoordinator, type PresentationSamplePayload } from "../experiments/coordinator.js";
import { IndexedDbExperimentStorage } from "../experiments/indexeddb-storage.js";
import { createBrowserDiagnosticLogger } from "../experiments/diagnostic-logger.js";
import {
    GrowTimeController,
    LocalStorageGrowTimeStore,
    DEFAULT_GROW_TIME_CONFIG,
    type GrowTimeStore,
} from "../growth/grow-time.js";
import { captureCharacterPresentation, capturePerspectiveCamera } from "../experiments/three-adapters.js";
import { captureExperientialScale } from "../experiments/experiential-scale-adapter.js";
import { applyPresentationAccentEvaluation } from "../experiments/presentation-accent-adapter.js";
import { validateExperientialScaleProfileSet, type ExperientialScaleProfileSet } from "../growth/experiential-scale.js";
import { TwoDimensionalSpriteLab, type StreamedGlbGrowthSubject } from "./two-dimensional-sprite-lab.js";
import { M1ASVFXGrowthModel } from "../growth/model-adapters.js";
import type { GrowthModelCommand } from "../growth/model-contract.js";


const BOX_TIER_NAMES = [
    "Broken Jar",
    "Sewer Pipes",
    "Lab Sink",
    "Lab Growth Tank",
    "Lab Viewing Room",
    "Ceiling Vent Escape",
    "Street World (Cars & Houses)"
];

const PROP_ROLE_DEFAULT_HEIGHTS: Record<PropRole, string> = {
    consumable: "0.4",
    wearable: "0.9",
    container: "1.6",
    "growth-gate": "2.6",
    reference: "1.8"
};

export interface Big3rSandboxOptions {
    userId: string;
    engineFactory: VfxEngineFactory;
}

export class Big3rSandboxController {
    private readonly userId: string;
    private readonly engineFactory: VfxEngineFactory;
    private readonly diagnostics = createBrowserDiagnosticLogger();
    private activeEngine: IVfxEngine | null = null;

    private coordinator: Big3rStageCoordinator | null = null;
    private experimentCoordinator: ExperimentCoordinator | null = null;
    private experimentStorage: IndexedDbExperimentStorage | null = null;
    private experimentControls: HTMLElement | null = null;
    private experimentStatus: HTMLElement | null = null;
    private experimentExportLink: HTMLAnchorElement | null = null;
    private growthModelControls: HTMLElement | null = null;
    private growthModelSelect: HTMLSelectElement | null = null;
    private growthModelStatus: HTMLElement | null = null;
    private currentBoxTier = 1;
    private growTimeController: GrowTimeController | null = null;
    private growTimeStore: GrowTimeStore | null = null;
    private growTimeStatus: HTMLElement | null = null;
    private growTimeControls: HTMLElement | null = null;
    private growTimeKeyDown: ((event: KeyboardEvent) => void) | null = null;
    private growTimeKeyUp: ((event: KeyboardEvent) => void) | null = null;
    private growTimeReadout: HTMLElement | null = null;
    private lastGrowthFlowSampleTimeSeconds = -1;
    private experientialScaleProfiles: ExperientialScaleProfileSet | null = this.loadExperientialScaleProfiles();
    private growthLab: TwoDimensionalSpriteLab;
    private activeAssetIdentity: StreamedGlbGrowthSubject | null = null;
    private pendingGrowthRecipe: { recipeId: string; adapter: M1ASVFXGrowthModel; context: { experimentId: string; simulationTimeSeconds: number; configurationVersion: string }; startedAt: number; commands: Array<{ atSeconds: number; command: GrowthModelCommand }>; nextIndex: number } | null = null;

    private readonly streamingHud = document.getElementById("vfxStreamingHud") as HTMLElement | null;
    private readonly heightReticle = document.getElementById("vfxHeightReticle") as HTMLElement | null;

    private readonly roomSlotSelect = document.getElementById("vfxRoomSlotSelect") as HTMLSelectElement | null;
    private readonly roomAssetTypeSelect = document.getElementById("vfxRoomAssetType") as HTMLSelectElement | null;
    private readonly roomValueInput = document.getElementById("vfxRoomValueInput") as HTMLInputElement | null;
    private readonly paintRoomBtn = document.getElementById("vfxPaintRoomBtn") as HTMLButtonElement | null;
    private readonly doubleSidedToggle = document.getElementById("vfxDoubleSidedRoomToggle") as HTMLInputElement | null;
    private readonly exportPresetBtn = document.getElementById("vfxExportPresetBtn") as HTMLButtonElement | null;
    private readonly importPresetBtn = document.getElementById("vfxImportPresetBtn") as HTMLButtonElement | null;
    private readonly presetFileInput = document.getElementById("vfxPresetFileInput") as HTMLInputElement | null;

    private readonly camRigSelect = document.getElementById("vfxCamRigSelect") as HTMLSelectElement | null;
    private readonly mountTvBtn = document.getElementById("vfxMountTvBtn") as HTMLButtonElement | null;
    private readonly loadManifestBtn = document.getElementById("vfxLoadManifestBtn") as HTMLButtonElement | null;
    private readonly manifestFileInput = document.getElementById("vfxManifestFileInput") as HTMLInputElement | null;

    private readonly glbUrlInput = document.getElementById("vfxGlbUrlInput") as HTMLInputElement;
    private readonly overlayUrlInput = document.getElementById("vfxOverlayUrlInput") as HTMLInputElement;
    private readonly mountBtn = document.getElementById("mountVfxEngineBtn") as HTMLButtonElement;
    private readonly controlBar = document.getElementById("vfxControlBar") as HTMLElement;
    private readonly stageContainer = document.getElementById("vfxStageContainer") as HTMLElement;
    private readonly telemetryBadge = document.getElementById("vfxTelemetryBadge") as HTMLElement;

    private readonly growthModeSelect = document.getElementById("vfxGrowthMode") as HTMLSelectElement;
    private readonly stimulusTypeSelect = document.getElementById("vfxStimulusType") as HTMLSelectElement;
    private readonly pulseBtn = document.getElementById("vfxPulseBtn") as HTMLButtonElement;
    private readonly holdBtn = document.getElementById("vfxHoldBtn") as HTMLButtonElement;
    private readonly chaosBtn = document.getElementById("vfxChaosBtn") as HTMLButtonElement;
    private readonly resetBtn = document.getElementById("vfxResetBtn") as HTMLButtonElement;

    private readonly boxPresetSelect = document.getElementById("vfxBoxPreset") as HTMLSelectElement;
    private readonly ceilingSlider = document.getElementById("vfxCeilingSlider") as HTMLInputElement;
    private readonly ceilingVal = document.getElementById("vfxCeilingVal") as HTMLElement;
    private readonly cinematicCamToggle = document.getElementById("vfxCinematicCamToggle") as HTMLInputElement;

    private readonly propUrlInput = document.getElementById("vfxPropUrlInput") as HTMLInputElement;
    private readonly propRoleSelect = document.getElementById("vfxPropRole") as HTMLSelectElement;
    private readonly propHeightInput = document.getElementById("vfxPropHeight") as HTMLInputElement;
    private readonly spawnPropBtn = document.getElementById("vfxSpawnPropBtn") as HTMLButtonElement;
    private readonly respawnPropsBtn = document.getElementById("vfxRespawnPropsBtn") as HTMLButtonElement;
    private readonly propListContainer = document.getElementById("vfxPropListContainer") as HTMLElement;

    constructor(options: Big3rSandboxOptions) {
        this.userId = options.userId;
        this.engineFactory = options.engineFactory;
        this.bindEvents();
        this.growthLab = new TwoDimensionalSpriteLab(this.stageContainer, {
            executeGrowthRecipe: (recipe) => this.executeGrowthRecipe(recipe),
        });
    }

    isActive(): boolean {
        return this.activeEngine !== null;
    }

    getCanvas(): HTMLCanvasElement | null {
        return this.activeEngine ? this.activeEngine.getCanvas() : null;
    }

    setTransparentBackground(enabled: boolean): void {
        this.activeEngine?.setTransparentBackground(enabled);
    }

    async setGrowthVfxOverlay(webmUrl: string, assetLabel?: string): Promise<void> {
        this.overlayUrlInput.value = webmUrl;
        if (this.activeEngine) {
            await this.activeEngine.setVfxWebm(webmUrl);
            if (assetLabel) {
                this.telemetryBadge.textContent = `⚡ Bound "${assetLabel}" as Growth VFX!`;
            }
        }
    }

    async spawnPropFromAsset(signedUrl: string, displayName: string): Promise<void> {
        this.propUrlInput.value = signedUrl;

        if (!this.activeEngine) {
            alert("Signed URL loaded into '+ Add Scene .glb'! Launch the VFX Stage with a primary character first, then click '+ Spawn Prop'.");
            return;
        }

        this.diagnostics.info("asset-stream", "Beginning spatial prop GLB stream.", { displayName, role: this.propRoleSelect.value });
        await this.activeEngine.addSpatialProp(signedUrl, {
            name: displayName,
            role: this.propRoleSelect.value as PropRole,
            targetHeight: parseFloat(this.propHeightInput.value) || 0.6,
            x: (Math.random() - 0.5) * 5,
            z: (Math.random() - 0.5) * 5
        });
    }

    async mount(glbSignedUrl: string, vfxWebmSignedUrl = "", assetIdentity?: StreamedGlbGrowthSubject): Promise<void> {
        if (!glbSignedUrl || !glbSignedUrl.trim()) {
            alert("Please provide a valid .glb signed URL first.");
            return;
        }

        this.glbUrlInput.value = glbSignedUrl;
        this.activeAssetIdentity = null;
        this.pendingGrowthRecipe = null;
        this.growthLab.setActiveStreamedSubject(null);
        this.growthModelControls?.remove();
        this.growthModelControls = null;
        this.growthModelSelect = null;
        this.diagnostics.info("asset-stream", "Beginning primary GLB stream.", { source: "sandbox_mount" });

        if (this.experimentCoordinator) {
            await this.experimentCoordinator.stop();
            this.experimentCoordinator = null;
        }

        if (this.coordinator) {
            this.coordinator.destroy();
            this.coordinator = null;
        }

        if (this.activeEngine) {
            this.activeEngine.destroy();
            this.activeEngine = null;
        }

        this.stageContainer.innerHTML = `<div class="stage-placeholder stage-placeholder--vfx-loading">Streaming .glb payload into M1ASVFXEngine v2...</div>`;

        try {
            const res = await fetch(glbSignedUrl, { headers: { "m1as-user-id": this.userId } });
            if (!res.ok) throw new Error(`GLB stream failed (${res.status})`);
            const glbBlob = await res.blob();
            this.diagnostics.info("asset-stream", "Primary GLB downloaded for local streaming.", { byteLength: glbBlob.size, contentType: glbBlob.type || "unknown" });
            const glbBlobUrl = URL.createObjectURL(glbBlob);

            this.stageContainer.innerHTML = "";
            const canvas = document.createElement("canvas");
            canvas.className = "inline-3d-canvas";
            this.stageContainer.appendChild(canvas);

            this.controlBar.classList.add("is-visible");
            const initialCeiling = parseFloat(this.ceilingSlider.value) || 3.2;

            this.activeEngine = await this.engineFactory(canvas, glbBlobUrl, {
                userId: this.userId,
                moveSpeed: 4.0,
                baseScale: 1.0,
                initialRoomCeiling: initialCeiling,
                cinematicCamera: this.cinematicCamToggle.checked,
                onPropsChanged: (props) => this.renderActivePropsUI(props),
                onFrame: (simulationTimeSeconds, frameNumber) => {
                    this.advanceGrowthRecipe(simulationTimeSeconds, frameNumber);
                    this.experimentCoordinator?.tick(simulationTimeSeconds, frameNumber);
                    if (this.growTimeController) {
                        this.growTimeController.advance(simulationTimeSeconds);
                        this.renderGrowTimeState();
                    }
                    const engine = this.activeEngine as M1ASVFXEngine | null;
                    const flow = engine?.getGrowthFlowTelemetry();
                    if (flow?.active && simulationTimeSeconds - this.lastGrowthFlowSampleTimeSeconds >= 0.5) {
                        this.lastGrowthFlowSampleTimeSeconds = simulationTimeSeconds;
                        const sample = {
                            model: engine?.getGrowthModel() ?? "m1as-vfx",
                            currentScale: engine?.getCurrentVisualScale(),
                            supplyRemainingSeconds: flow.supplyRemainingSeconds,
                            flowMultiplier: flow.flowMultiplier,
                            growthPerSupplySecond: flow.growthPerSupplySecond,
                        };
                        this.diagnostics.log({
                            level: "info", category: "growth-flow-sample",
                            message: "Sustained growth flow sample.",
                            experimentId: this.experimentCoordinator?.experimentId,
                            simulationTimeSeconds, frameNumber, data: sample,
                        });
                        this.experimentCoordinator?.trigger("growth_flow_sample", simulationTimeSeconds, frameNumber);
                    }
                },
                onGrowthQueued: (simulationTimeSeconds, frameNumber) => {
                    this.diagnostics.log({ level: "info", category: "growth-queue", message: "Growth stimulus queued.", experimentId: this.experimentCoordinator?.experimentId, simulationTimeSeconds, frameNumber });
                    this.experimentCoordinator?.trigger("growth_queued", simulationTimeSeconds, frameNumber);
                },
                onDiagnostic: (level, category, message, data) => {
                    this.diagnostics.log({ level, category, message, experimentId: this.experimentCoordinator?.experimentId, data });
                },
                onGrowthReleased: (event, simulationTimeSeconds, frameNumber) => {
                    const model = this.activeEngine?.getGrowthModel?.() ?? "m1as-vfx";
                    this.diagnostics.log({
                        level: "info",
                        category: model === "m1as-vfx" ? "growth-queue" : "baseline-growth",
                        message: model === "m1as-vfx" ? "Legacy M1AS queue event released." : "Baseline scaling growth stimulus released.",
                        experimentId: this.experimentCoordinator?.experimentId,
                        simulationTimeSeconds,
                        frameNumber,
                        data: { model, oldScale: event.oldScale, newScale: event.newScale, delta: event.delta, stimulus: event.type },
                    });
                    if (model === "m1as-vfx") {
                        this.experimentCoordinator?.recordLegacyQueueRelease(event, simulationTimeSeconds, frameNumber);
                    } else {
                        this.experimentCoordinator?.trigger("baseline_growth_released", simulationTimeSeconds, frameNumber);
                    }
                },
                onStateChange: (state) => {
                    this.currentBoxTier = state.boxTier;
                    this.updateTelemetry(state)

                },
                onRoomCollapse: (_newBoxTier, newCeiling) => {
                    this.ceilingSlider.value = Math.min(12, newCeiling).toFixed(1);
                    this.ceilingVal.textContent = `${newCeiling.toFixed(1)}m`;
                }
            });

            this.activeAssetIdentity = assetIdentity ?? null;
            this.growthLab.setActiveStreamedSubject(this.activeAssetIdentity);
            this.installGrowthModelSelector(this.activeEngine);
            this.installExperimentControls(this.activeEngine as unknown as M1ASVFXEngine);
            this.installGrowTimeControls(this.activeEngine as unknown as M1ASVFXEngine);

            this.coordinator = new Big3rStageCoordinator(
                this.activeEngine as unknown as M1ASVFXEngine,
                this.userId,
                initialCeiling
            );
            if (this.streamingHud) this.coordinator.attachTelemetryHud(this.streamingHud);
            if (this.heightReticle) this.coordinator.attachHeightReticle(this.heightReticle);


            this.activeEngine.setMode(this.growthModeSelect.value as GrowthMode);

            const overlayUrl = vfxWebmSignedUrl || this.overlayUrlInput.value.trim();
            if (overlayUrl) {
                await this.activeEngine.setVfxWebm(overlayUrl);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.stageContainer.innerHTML = `<div class="vfx-error-box">⚠️ M1ASVFXEngine Error: ${message}</div>`;
        }
    }

    private installExperimentControls(engine: M1ASVFXEngine): void {
        const previousExport = this.experimentExportLink && !this.experimentExportLink.hidden
            ? { href: this.experimentExportLink.href, download: this.experimentExportLink.download }
            : null;
        if (this.experimentControls) this.experimentControls.remove();
        const panel = document.createElement("div");
        panel.className = "m1as-experiment-controls vfx-control-row vfx-control-row--divided-tight m1as-select";
        const scaleProfileInput = document.createElement("input");
        scaleProfileInput.type = "file";
        scaleProfileInput.accept = "application/json,.json";
        scaleProfileInput.hidden = true;
        const importScaleProfiles = document.createElement("button");
        importScaleProfiles.type = "button";
        importScaleProfiles.textContent = "Import Scale Profiles";
        importScaleProfiles.addEventListener("click", () => scaleProfileInput.click());
        scaleProfileInput.addEventListener("change", async () => {
            const file = scaleProfileInput.files?.item(0);
            if (!file) return;
            try {
                const parsed: unknown = JSON.parse(await file.text());
                validateExperientialScaleProfileSet(parsed);
                this.experientialScaleProfiles = parsed;
                localStorage.setItem("big3r.experientialScaleProfiles.v1", JSON.stringify(parsed));
                exportScaleProfiles.disabled = false;
                status.textContent = `Loaded scale profiles ${parsed.id} · v${parsed.version}`;
                this.diagnostics.info("experiential-scale", "Authored experiential-scale profiles loaded.", {
                    profileSetId: parsed.id, profileSetVersion: parsed.version,
                    stageProfiles: Object.keys(parsed.stages), cameraProfiles: Object.keys(parsed.cameras),
                });
            } catch (error) {
                status.textContent = `Scale profile import failed: ${error instanceof Error ? error.message : String(error)}`;
            } finally {
                scaleProfileInput.value = "";
            }
        });
        const exportScaleProfiles = document.createElement("button");
        exportScaleProfiles.type = "button";
        exportScaleProfiles.textContent = "Export Scale Profiles";
        exportScaleProfiles.disabled = !this.experientialScaleProfiles;
        exportScaleProfiles.addEventListener("click", () => {
            if (!this.experientialScaleProfiles) return;
            const blob = new Blob([JSON.stringify(this.experientialScaleProfiles, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `experiential-scale-profiles-${this.experientialScaleProfiles.id}-v${this.experientialScaleProfiles.version}.json`;
            link.click();
            URL.revokeObjectURL(url);
        });

        const profileSelect = document.createElement("select");
        profileSelect.className = "m1as-select";
        for (const profileName of ["lightweight", "detailed", "discovery"] as const) {
            const option = document.createElement("option");
            option.value = profileName;
            option.textContent = profileName;
            profileSelect.appendChild(option);
        }
        const start = document.createElement("button");
        start.type = "button";
        start.className = "playground-btn btn--emerald";
        start.textContent = "Start Experiment Capture";
        const stop = document.createElement("button");
        stop.type = "button";
        stop.textContent = "Stop & Finalize";
        stop.disabled = true;
        const status = document.createElement("span");
        status.textContent = "Experiment capture idle";
        const exportLink = document.createElement("a");
        exportLink.hidden = true;
        exportLink.textContent = "Download Experiment JSON";
        exportLink.style.marginLeft = "8px";

        start.addEventListener("click", async () => {
            if (this.experimentCoordinator?.isRecording) return;
            this.experimentStorage?.dispose();
            const profileName = profileSelect.value as keyof typeof DEFAULT_CAPTURE_PROFILES;
            const profile = { ...DEFAULT_CAPTURE_PROFILES[profileName] };
            const experimentId = `13163r-${Date.now()}`;
            const manifest: ExperimentManifest = {
                experimentId,
                schemaVersion: EXPERIMENT_SCHEMA_VERSION,
                createdAtISO: new Date().toISOString(),
                title: "13163R Sandbox Growth Experiment",
                description: "Live observational capture from the BIG3R sandbox.",
                buildVersion: "runtime",
                configurationVersion: "sandbox-default",
                worldUnit: "meters",
                screenCoordinateConvention: "normalized_top_left_origin",
                captureProfile: profile,
                configurationRefs: {
                    character: "active-glb",
                    growth: `growth-model:${engine.getGrowthModel?.() ?? "legacy-unknown"}`,
                    camera: "runtime-perspective-camera",
                    world: "sandbox-stage",
                    experientialScale: this.experientialScaleProfiles
                        ? `${this.experientialScaleProfiles.id}@${this.experientialScaleProfiles.version}`
                        : "unconfigured",
                },
            };
            const storage = new IndexedDbExperimentStorage((url, fileName) => {
                exportLink.href = url;
                exportLink.download = fileName;
                exportLink.hidden = false;
                status.textContent = "Experiment finalized, persisted locally, and ready to download.";
            });
            this.diagnostics.info("experiment", "Starting experiment capture.", { experimentId, captureProfile: profile.name });
            const coordinator = new ExperimentCoordinator({
                manifest,
                storage,
                capturePresentation: (): PresentationSamplePayload => {
                    const canvas = engine.getCanvas();
                    const viewport = {
                        widthPixels: Math.max(1, canvas.clientWidth || canvas.width),
                        heightPixels: Math.max(1, canvas.clientHeight || canvas.height),
                        aspectRatio: engine.getCamera().aspect,
                    };
                    const camera = capturePerspectiveCamera(engine.getCamera(), viewport, {
                        target: engine.getControls().target,
                        cameraMode: this.camRigSelect ? `rig-${this.camRigSelect.value}` : "sandbox",
                    });
                    const activeStageId = `sandbox-box-tier-${this.currentBoxTier}`;
                    const activeCameraMode = this.camRigSelect ? `rig-${this.camRigSelect.value}` : "sandbox";
                    const character = captureCharacterPresentation(
                        engine.getSubjectRoot(), engine.getCamera(), manifest.worldUnit,
                    );
                    character.experientialScale = captureExperientialScale({
                        subjectId: "active-glb-subject",
                        root: engine.getSubjectRoot(),
                        camera: engine.getCamera(),
                        viewportWidth: viewport.widthPixels,
                        viewportHeight: viewport.heightPixels,
                        worldUnit: manifest.worldUnit,
                        stageId: activeStageId,
                        cameraMode: activeCameraMode,
                        profiles: this.experientialScaleProfiles,
                    });
                    if (character.experientialScale.status === "available") {
                        const snapshot = character.experientialScale.value;
                        if (snapshot.presentationAccent.status === "available") {
                            const applied = applyPresentationAccentEvaluation(
                                snapshot.presentationAccent.value, engine,
                            );
                            character.experientialScale = {
                                ...character.experientialScale,
                                value: { ...snapshot, presentationAccent: {
                                    status: "available",
                                    value: applied,
                                    provenance: "presentation-accent-effect-host-application",
                                } },
                            };
                        } else {
                            engine.clearPresentationAccentChannels([]);
                        }
                    } else {
                        engine.clearPresentationAccentChannels([]);
                    }
                    const growthState = engine.getGrowthModelTelemetry();
                    if (character.experientialScale.status === "available") {
                        growthState.experientialScale = character.experientialScale.value;
                    }
                    character.deformationState = {
                        status: "available",
                        value: {
                            currentScale: growthState.currentScale,
                            targetScale: growthState.targetScale,
                            growthVelocity: growthState.growthVelocity,
                            instability: growthState.instability,
                            biologicalVisualExpansion: growthState.biologicalVisualExpansion,
                            biologicalInternalPressure: growthState.biologicalInternalPressure,
                            biologicalPressureWave: growthState.biologicalPressureWave,
                        },
                        provenance: "M1ASVFXEngine.getGrowthModelTelemetry",
                    };
                    character.vfxState = {
                        status: "available",
                        value: {
                            biologicalBreath: growthState.biologicalBreath ?? {
                                visualExpansion: growthState.biologicalVisualExpansion,
                                internalPressure: growthState.biologicalInternalPressure,
                                pressureWave: growthState.biologicalPressureWave,
                            },
                            biologicalBreathingActive: growthState.biologicalBreathingActive,
                            posture: growthState.posture,
                            goldenBuffer: growthState.goldenBuffer,
                            ...(growthState.experientialScale ? { experientialScale: growthState.experientialScale } : {}),
                        },
                        provenance: "M1ASVFXEngine biological and presentation telemetry",
                    };
                    return {
                        cameraConfiguration: {
                            status: "not_captured",
                            reason: "The sandbox does not yet expose its authored camera configuration separately.",
                        },
                        cameraRuntime: camera,
                        character,
                        worldLandmarks: [],
                        screen: {
                            viewport,
                            characterBounds: character.screenBounds,
                            characterOccupancy: character.screenOccupancy,
                            viewportEdgeContact: {
                                status: "not_captured",
                                reason: "Viewport-edge contact is not yet derived from the projected bounds.",
                            },
                            occlusion: {
                                status: "unsupported",
                                reason: "Pixel-accurate occlusion capture is not implemented.",
                            },
                            landmarkRatios: {},
                        },
                        relatedRequestIds: [],
                        relatedDecisionIds: [],
                        relatedEventIds: [],
                    };
                },
                onCaptureError: (error, stream) => {
                    this.diagnostics.error("experiment-capture", "Experiment capture or storage failed.", { experimentId, stream, error: String(error) });
                    status.textContent = `Capture warning (${stream}): ${String(error)}`;
                },
            });
            this.experimentStorage = storage;
            this.experimentCoordinator = coordinator;
            try {
                if (this.growthModelSelect) this.growthModelSelect.disabled = true;
                await coordinator.start();
                start.disabled = true;
                stop.disabled = false;
                exportLink.hidden = true;
                status.textContent = `Recording ${experimentId} · ${profile.name} profile · IndexedDB persistent capture`;
                this.diagnostics.info("experiment", "Experiment recording started.", { experimentId, captureProfile: profile.name });
            } catch (error) {
                this.experimentCoordinator = null;
                if (this.growthModelSelect) this.growthModelSelect.disabled = false;
                this.diagnostics.error("experiment", "Could not start experiment capture.", { experimentId, error: String(error) });
                status.textContent = `Could not start capture: ${String(error)}`;
            }
        });

        stop.addEventListener("click", async () => {
            const coordinator = this.experimentCoordinator;
            if (!coordinator) return;
            stop.disabled = true;
            try {
                await coordinator.stop();
                start.disabled = false;
                if (this.growthModelSelect) this.growthModelSelect.disabled = false;
            } catch (error) {
                status.textContent = `Finalize warning: ${String(error)}`;
                start.disabled = false;
                if (this.growthModelSelect) this.growthModelSelect.disabled = false;
            }
        });

        if (previousExport) {
            exportLink.href = previousExport.href;
            exportLink.download = previousExport.download;
            exportLink.hidden = false;
        }
        panel.append(importScaleProfiles, exportScaleProfiles, scaleProfileInput);
        panel.append(profileSelect, start, stop, status, exportLink);
        this.controlBar.appendChild(panel);
        this.experimentControls = panel;
        this.experimentStatus = status;
        this.experimentExportLink = exportLink;
    }


    /** Selects the growth implementation while preserving the mounted GLB and scene. */

    private async executeGrowthRecipe(rawRecipe: unknown): Promise<string> {
        if (!this.activeEngine) throw new Error("Mount an M1AS GLB before executing a growth recipe.");
        if (!this.activeAssetIdentity) throw new Error("The active GLB has no M1AS asset identity. Load it from the M1AS asset list, not an untracked URL.");
        const engine = this.activeEngine as M1ASVFXEngine;
        if (engine.getGrowthModel() !== "m1as-vfx") {
            throw new Error("Select M1AS VFX Growth before scheduling this recipe. Baseline scaling is not the M1AS queue adapter.");
        }
        if (this.pendingGrowthRecipe) throw new Error("A growth recipe is already running. Let it finish before scheduling another.");
        if (!rawRecipe || typeof rawRecipe !== "object") throw new Error("Recipe must be a JSON object.");
        const recipe = rawRecipe as { schemaVersion?: unknown; id?: unknown; title?: unknown; subject?: { assetKind?: unknown }; commands?: unknown };
        if (recipe.schemaVersion !== "m1as-growth-recipe/1.0" ||
            typeof recipe.id !== "string" || !recipe.id.trim() ||
            !Array.isArray(recipe.commands) || recipe.commands.length === 0) {
            throw new Error("Expected schemaVersion m1as-growth-recipe/1.0, a recipe id, and a non-empty commands array.");
        }
        const execution = (rawRecipe as { execution?: { model?: unknown } }).execution;
        if (execution?.model && execution.model !== "m1as-vfx-queue") {
            throw new Error("This recipe targets a different growth model. Select the M1AS VFX queue model.");
        }
        if (recipe.subject?.assetKind && recipe.subject.assetKind !== this.activeAssetIdentity.assetKind) {
            throw new Error("Recipe assetKind does not match the active M1AS GLB subject.");
        }
        const commandIds = new Set<string>();
        let previousOffset = -1;
        const commands: Array<{ atSeconds: number; command: GrowthModelCommand }> = [];
        for (const [index, rawCommand] of recipe.commands.entries()) {
            if (!rawCommand || typeof rawCommand !== "object") throw new Error("Command " + (index + 1) + " must be an object.");
            const item = rawCommand as Record<string, unknown>;
            const atSeconds = item.atSeconds === undefined ? 0 : item.atSeconds;
            if (typeof atSeconds !== "number" || !Number.isFinite(atSeconds) || atSeconds < 0 || atSeconds < previousOffset) {
                throw new Error("Command " + (index + 1) + " atSeconds must be finite, non-negative, and in non-decreasing order.");
            }
            previousOffset = atSeconds;
            if (typeof item.commandId !== "string" || !item.commandId.trim()) throw new Error("Command " + (index + 1) + " needs a commandId.");
            if (commandIds.has(item.commandId)) throw new Error("Duplicate commandId: " + item.commandId);
            commandIds.add(item.commandId);
            let command: GrowthModelCommand;
            if (item.kind === "discrete") {
                const amount = item.amount as { kind?: unknown; fraction?: unknown; scale?: unknown } | undefined;
                const validAmount = amount && (
                    amount.kind === "relative_change"
                        ? typeof amount.fraction === "number" && Number.isFinite(amount.fraction) && amount.fraction >= 0
                        : amount.kind === "absolute_target" && typeof amount.scale === "number" && Number.isFinite(amount.scale) && amount.scale > 0
                );
                if (!validAmount || typeof item.stimulus !== "string") throw new Error("Discrete command " + item.commandId + " has an invalid stimulus or amount.");
                if (item.requestedDurationSeconds !== undefined) throw new Error("Discrete command " + item.commandId + " requests a duration, but the legacy M1AS queue owns its transition timing. Use atSeconds to schedule when the command is submitted.");
                command = { kind: "discrete", commandId: item.commandId, stimulus: item.stimulus, amount: amount!.kind === "relative_change" ? { kind: "relative_change", fraction: amount!.fraction as number } : { kind: "absolute_target", scale: amount!.scale as number }, parameters: this.parseGrowthRecipeParameters(item.parameters, item.commandId) };
            } else if (item.kind === "flow") {
                if (typeof item.supplySeconds !== "number" || !Number.isFinite(item.supplySeconds) || item.supplySeconds <= 0 ||
                    typeof item.flowMultiplier !== "number" || !Number.isFinite(item.flowMultiplier) || item.flowMultiplier <= 0) {
                    throw new Error("Flow command " + item.commandId + " requires positive supplySeconds and flowMultiplier.");
                }
                command = { kind: "flow", commandId: item.commandId, supplySeconds: item.supplySeconds, flowMultiplier: item.flowMultiplier, stimulus: typeof item.stimulus === "string" ? item.stimulus : "Buff", parameters: this.parseGrowthRecipeParameters(item.parameters, item.commandId) };
            } else if (item.kind === "hold") {
                if (typeof item.active !== "boolean") throw new Error("Hold command " + item.commandId + " requires active true or false.");
                command = { kind: "hold", commandId: item.commandId, active: item.active, stimulus: typeof item.stimulus === "string" ? item.stimulus : "Buff", parameters: this.parseGrowthRecipeParameters(item.parameters, item.commandId) };
            } else {
                throw new Error("Command " + (index + 1) + " kind must be discrete, flow, or hold.");
            }
            commands.push({ atSeconds, command });
        }

        const startTime = engine.getSimulationTimeSeconds();
        const context = {
            experimentId: "recipe-" + recipe.id + "-" + Math.floor(startTime * 1000),
            simulationTimeSeconds: startTime,
            configurationVersion: String(recipe.schemaVersion),
        };
        const adapter = new M1ASVFXGrowthModel(engine);
        adapter.initialize({
            subjectId: this.activeAssetIdentity.assetId,
            assetId: this.activeAssetIdentity.assetId,
            assetKind: this.activeAssetIdentity.assetKind,
            initialDimensions: { x: 1, y: 1, z: 1 },
            worldUnit: "meters",
        }, context);
        this.pendingGrowthRecipe = { recipeId: recipe.id, adapter, context, startedAt: startTime, commands, nextIndex: 0 };
        this.diagnostics.info("growth-recipe", "M1AS GLB growth recipe scheduled on the engine simulation clock.", {
            recipeId: recipe.id, assetId: this.activeAssetIdentity.assetId, commandCount: commands.length,
            startSimulationTimeSeconds: startTime, scheduledOffsetsSeconds: commands.map(item => item.atSeconds),
        });
        return "Scheduled " + commands.length + " command(s) for " + String(recipe.title || recipe.id) +
            " on " + this.activeAssetIdentity.displayName + ". Timing is relative to the active M1AS simulation clock.";
    }


    private parseGrowthRecipeParameters(
        value: unknown,
        commandId: string,
    ): Record<string, number | string | boolean> | undefined {
        if (value === undefined) return undefined;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("Command " + commandId + " parameters must be an object of scalar values.");
        }
        const parameters: Record<string, number | string | boolean> = {};
        for (const [key, parameter] of Object.entries(value)) {
            if (typeof parameter !== "string" && typeof parameter !== "boolean" &&
                (typeof parameter !== "number" || !Number.isFinite(parameter))) {
                throw new Error("Command " + commandId + " parameter " + key + " must be a finite number, string, or boolean.");
            }
            parameters[key] = parameter as number | string | boolean;
        }
        return parameters;
    }

    private advanceGrowthRecipe(simulationTimeSeconds: number, frameNumber: number): void {
        const pending = this.pendingGrowthRecipe;
        if (!pending) return;
        while (pending.nextIndex < pending.commands.length) {
            const scheduled = pending.commands[pending.nextIndex];
            if (simulationTimeSeconds - pending.startedAt < scheduled.atSeconds) break;
            let requestedOutcome: GrowthOutcome;
            if (scheduled.command.kind === "discrete") {
                const amount = scheduled.command.amount.kind === "relative_change"
                    ? { kind: "relative_change" as const, changeFraction: scheduled.command.amount.fraction }
                    : { kind: "absolute_target" as const, targetScale: scheduled.command.amount.scale };
                requestedOutcome = { components: [amount], compositionPolicy: "additive" };
            } else if (scheduled.command.kind === "flow") {
                requestedOutcome = {
                    components: [{
                        kind: "authored_profile",
                        profileId: "m1as-sustained-flow",
                        profileVersion: "m1as-vfx-queue-v1",
                        parameters: {
                            supplySeconds: scheduled.command.supplySeconds,
                            flowMultiplier: scheduled.command.flowMultiplier,
                            ...(scheduled.command.parameters ?? {}),
                        },
                    }],
                    compositionPolicy: "authored",
                };
            } else {
                requestedOutcome = {
                    components: [{
                        kind: "authored_profile",
                        profileId: "m1as-hold-growth",
                        profileVersion: "m1as-vfx-queue-v1",
                        parameters: {
                            active: scheduled.command.active,
                            ...(scheduled.command.parameters ?? {}),
                        },
                    }],
                    compositionPolicy: "authored",
                };
            }
            this.experimentCoordinator?.recordGrowthRecipeRequest({
                requestId: pending.context.experimentId + ":" + scheduled.command.commandId,
                source: "glb-growth-recipe:" + pending.recipeId,
                outcome: requestedOutcome,
                simulationTimeSeconds,
                frameNumber,
            });
            const result = pending.adapter.apply(scheduled.command, {
                ...pending.context,
                simulationTimeSeconds,
            });
            this.diagnostics.log({
                level: result.accepted ? "info" : "warn",
                category: "growth-recipe",
                message: result.accepted ? "Scheduled growth recipe command submitted to M1AS engine." : "M1AS engine rejected a scheduled growth recipe command.",
                experimentId: this.experimentCoordinator?.experimentId,
                simulationTimeSeconds,
                frameNumber,
                data: { recipeId: pending.recipeId, commandId: result.commandId, scheduledAtSeconds: scheduled.atSeconds, accepted: result.accepted, reason: result.reason },
            });
            this.experimentCoordinator?.trigger("growth_recipe_command", simulationTimeSeconds, frameNumber);
            pending.nextIndex += 1;
            if (!result.accepted) {
                this.diagnostics.warn("growth-recipe", "Recipe execution stopped after a rejected command.", { recipeId: pending.recipeId, commandId: result.commandId, reason: result.reason });
                this.pendingGrowthRecipe = null;
                return;
            }
        }
        if (pending.nextIndex >= pending.commands.length) {
            this.diagnostics.info("growth-recipe", "M1AS GLB growth recipe completed.", { recipeId: pending.recipeId, commandCount: pending.commands.length });
            this.pendingGrowthRecipe = null;
        }
    }

    private installGrowthModelSelector(engine: IVfxEngine): void {
        this.growthModelControls?.remove();
        this.growthModelControls = null;
        this.growthModelSelect = null;
        this.growthModelStatus = null;
        if (!engine.getGrowthModel || !engine.setGrowthModel) {
            this.diagnostics.warn("growth-model", "The active engine factory does not expose interchangeable growth models.");
            return;
        }

        const panel = document.createElement("section");
        panel.className = "m1as-growth-model-selector m1as-select vfx-control-row";
        const label = document.createElement("label");
        label.textContent = "Growth Model               ";
        label.style.color = "#10b981";
        const select = document.createElement("select");
        select.style.paddingLeft = "10px";
        select.className = "m1as-select";
        const options = [
            { value: "m1as-vfx", label: "M1AS VFX Growth (Golden Boy direction)" },
            { value: "baseline-scale", label: "Baseline GLB Scaling" },
        ];
        for (const item of options) {
            const option = document.createElement("option");
            option.value = item.value;
            option.textContent = item.label;
            select.appendChild(option);
        }
        select.value = engine.getGrowthModel();
        label.appendChild(select);

        const status = document.createElement("span");
        status.textContent = "Switch only when the current growth sequence is idle.";
        status.style.color = "#10b981";
        select.addEventListener("change", () => {
            const next = select.value as "m1as-vfx" | "baseline-scale";
            const previous = engine.getGrowthModel?.() ?? "m1as-vfx";
            const switched = engine.setGrowthModel?.(next) ?? false;
            if (!switched) {
                select.value = previous;
                status.textContent = "Model switch blocked: finish or reset the active growth sequence first.";
                this.diagnostics.warn("growth-model", "Growth model switch rejected because the current model is not idle.", {
                    requestedModel: next, activeModel: previous,
                });
                return;
            }
            status.textContent = next === "m1as-vfx"
                ? "M1AS VFX model active · queue, deformation and VFX enabled."
                : "Baseline model active · same GLB, direct whole-object scaling.";
            this.diagnostics.info("growth-model", "Sandbox growth model changed.", { model: next });
            this.telemetryBadge.textContent = next === "m1as-vfx"
                ? "M1AS VFX Growth Model"
                : "Baseline GLB Scaling Model";
        });

        const m1asEngine = engine as M1ASVFXEngine;

        const breathingStart = document.createElement("button");
        breathingStart.type = "button";
        breathingStart.textContent = "Start Biological Breathing";
        const breathingPause = document.createElement("button");
        breathingPause.type = "button";
        breathingPause.textContent = "Pause Breathing";
        const breathingStatus = document.createElement("span");
        breathingStatus.textContent = "Biological breathing is inactive.";
        const refreshBreathingControls = () => {
            const active = m1asEngine.getBiologicalBreathingActive();
            breathingStart.disabled = active || engine.getGrowthModel?.() !== "m1as-vfx";
            breathingPause.disabled = !active;
            breathingStatus.textContent = active
                ? "Biological breathing active · scale accumulation and pressure pulse are independent."
                : "Biological breathing paused · accumulated scale is retained.";
        };
        breathingStart.addEventListener("click", () => {
            const started = m1asEngine.startBiologicalBreathing();
            if (!started) {
                breathingStatus.textContent = engine.getGrowthModel?.() !== "m1as-vfx"
                    ? "Biological breathing currently requires the M1AS VFX model."
                    : "Finish the current queue, hold, or sustained flow before starting a breath sequence.";
            }
            refreshBreathingControls();
        });
        breathingPause.addEventListener("click", () => {
            m1asEngine.pauseBiologicalBreathing();
            refreshBreathingControls();
        });
        select.addEventListener("change", refreshBreathingControls);
        refreshBreathingControls();
        panel.append(label, status, breathingStart, breathingPause, breathingStatus);
        this.controlBar.prepend(panel);
        this.growthModelControls = panel;
        this.growthModelSelect = select;
        this.growthModelStatus = status;
        status.textContent = select.value === "m1as-vfx"
            ? "M1AS VFX model active · queue, deformation and VFX enabled."
            : "Baseline model active · same GLB, direct whole-object scaling.";
    }

    /**
     * Minimal resource-loop prototype. The simulation clock is supplied by
     * M1ASVFXEngine; localStorage persists only the durable reserve/point totals.
     */
    private installGrowTimeControls(engine: M1ASVFXEngine): void {
        this.growTimeControls?.remove();
        this.lastGrowthFlowSampleTimeSeconds = -1;
        if (this.growTimeKeyDown) window.removeEventListener("keydown", this.growTimeKeyDown);
        if (this.growTimeKeyUp) window.removeEventListener("keyup", this.growTimeKeyUp);
        const panel = document.createElement("section");
        panel.className = "m1as-grow-time-controls m1as-select";
        this.growTimeControls = panel;
        panel.style.display = "grid";
        panel.style.gridTemplateColumns = "repeat(auto-fit, minmax(150px, 1fr))";
        panel.style.gap = "8px";
        panel.style.padding = "12px";
        panel.style.margin = "10px 0";
        // panel.style.border = "1px solid rgba(148,163,184,.35)";
        panel.style.borderRadius = "10px";

        const heading = document.createElement("strong");
        heading.textContent = "Grow Time · Resource Prototype";
        heading.style.gridColumn = "1 / -1";
        panel.appendChild(heading);

        let store: GrowTimeStore | null = null;
        try {
            store = new LocalStorageGrowTimeStore(window.localStorage);
        } catch { /* browser storage may be unavailable */ }
        this.growTimeStore = store;
        const saved = store?.load() ?? null;
        this.growTimeController = new GrowTimeController(DEFAULT_GROW_TIME_CONFIG, saved);

        const makeNumber = (label: string, value: number, step = "0.1"): HTMLLabelElement => {
            const wrapper = document.createElement("label");
            wrapper.className = "m1as-select";
            wrapper.textContent = label;
            wrapper.style.display = "grid";
            wrapper.style.gap = "4px";
            const input = document.createElement("input");
            input.type = "number";
            input.min = "0";
            input.step = step;
            input.value = String(value);
            input.style.minWidth = "0";
            wrapper.appendChild(input);
            return wrapper;
        };
        const pressRate = makeNumber("Points per A press", DEFAULT_GROW_TIME_CONFIG.pointsPerPress, "1");
        const holdRate = makeNumber("Points per B hold-second", DEFAULT_GROW_TIME_CONFIG.pointsPerHoldSecond);
        const conversionRate = makeNumber("Grow seconds per point", DEFAULT_GROW_TIME_CONFIG.growTimeSecondsPerPoint);
        const spendDuration = makeNumber("R consumption seconds", 5);
        const growthScaleRate = makeNumber("Growth per supply second", 0.1);
        const flowRate = makeNumber("Grow Time flow multiplier", 1.0);
        const conversion = document.createElement("select");
        conversion.className = "m1as=select"
        for (const mode of ["continuous", "restricted", "disabled"]) {
            const option = document.createElement("option");
            option.value = mode;
            option.textContent = `Conversion: ${mode}`;
            conversion.appendChild(option);
        }
        const stacking = document.createElement("label");
        const stackingToggle = document.createElement("input");
        stackingToggle.type = "checkbox";
        stackingToggle.checked = DEFAULT_GROW_TIME_CONFIG.allowStackingDuringGrowth;
        stacking.append(stackingToggle, document.createTextNode(" Allow stacking during growth"));

        const readout = document.createElement("div");
        readout.style.gridColumn = "1 / -1";
        readout.style.fontVariantNumeric = "tabular-nums";
        readout.style.lineHeight = "1.6";
        const status = document.createElement("div");
        status.style.gridColumn = "1 / -1";
        // status.style.color = "#94a3b8";
        status.textContent = "A stacks · hold B accumulates · R spends stored Grow Time";
        this.growTimeReadout = readout;
        this.growTimeStatus = status;

        const button = (label: string): HTMLButtonElement => {
            const el = document.createElement("button");
            el.type = "button";
            el.className = "playground-btn btn--violet";
            el.textContent = label;
            el.style.padding = "8px 12px";
            return el;
        };
        const aButton = button("A · Stack");
        const bButton = button("B · Hold to stack");
        const rButton = button("R · Rest / Grow");
        const stopFlowButton = button("Stop Flow · Refund unused supply");
        const makeKeyInput = (label: string, value: string): HTMLLabelElement => {
            const wrapper = document.createElement("label");
            wrapper.className = "m1as-select"
            wrapper.textContent = label;
            wrapper.style.display = "grid";
            wrapper.style.gap = "4px";
            const input = document.createElement("input");
            input.type = "text";
            input.maxLength = 1;
            input.value = value;
            input.style.width = "48px";
            wrapper.appendChild(input);
            return wrapper;
        };
        const aKey = makeKeyInput("A action key", "a");
        const bKey = makeKeyInput("B hold key", "b");
        const rKey = makeKeyInput("R growth key", "r");

        const applyConfig = () => {
            this.growTimeController?.updateConfig({
                conversionMode: conversion.value as "continuous" | "restricted" | "disabled",
                pointsPerPress: Math.max(0, Number((pressRate.querySelector("input") as HTMLInputElement).value) || 0),
                pointsPerHoldSecond: Math.max(0, Number((holdRate.querySelector("input") as HTMLInputElement).value) || 0),
                growTimeSecondsPerPoint: Math.max(0, Number((conversionRate.querySelector("input") as HTMLInputElement).value) || 0),
                allowStackingDuringGrowth: stackingToggle.checked,
            });
        };
        const saveAndRender = () => {
            this.persistGrowTime();
            this.renderGrowTimeState();
        };

        aButton.addEventListener("click", () => {
            applyConfig();
            this.growTimeController?.pressStack(engine.getSimulationTimeSeconds());
            saveAndRender();
        });
        const beginB = (event: Event) => {
            event.preventDefault();
            applyConfig();
            this.growTimeController?.beginHold(engine.getSimulationTimeSeconds());
            bButton.textContent = "B · Release to stop";
            saveAndRender();
        };
        const endB = () => {
            this.growTimeController?.endHold(engine.getSimulationTimeSeconds());
            bButton.textContent = "B · Hold to stack";
            saveAndRender();
        };
        bButton.addEventListener("pointerdown", beginB);
        bButton.addEventListener("pointerup", endB);
        bButton.addEventListener("pointerleave", endB);
        bButton.addEventListener("pointercancel", endB);
        const runRestAndGrow = () => {
            applyConfig();
            const seconds = Math.max(0, Number((spendDuration.querySelector("input") as HTMLInputElement).value) || 0);
            if (engine.getGrowthModel?.() !== "m1as-vfx") {
                status.textContent = "Sustained Grow Time flow currently requires the M1AS VFX growth model.";
                return;
            }
            const multiplier = Math.max(0.05, Number((flowRate.querySelector("input") as HTMLInputElement).value) || 1);
            const growthPerSupplySecond = Math.max(0, Number((growthScaleRate.querySelector("input") as HTMLInputElement).value) || 0);
            const consumed = this.growTimeController?.triggerRestAndGrow(
                engine.getSimulationTimeSeconds(), { kind: "duration", seconds },
            ) ?? 0;
            if (consumed > 0) {
                this.growTimeController?.setFlowMultiplier(multiplier);
                const started = engine.startGrowthFlow(consumed, multiplier, growthPerSupplySecond, GrowthStimulusType.Buff);
                if (started) {
                    status.textContent = `Sustained growth flow active · ${consumed.toFixed(2)}s supply · ${multiplier.toFixed(2)}× flow`;
                    this.diagnostics.info("growth-flow", "Grow Time supply committed to sustained M1AS growth.", {
                        supplySeconds: consumed, flowMultiplier: multiplier, growthPerSupplySecond,
                    });
                } else {
                    status.textContent = "Growth flow could not start; Grow Time was consumed. Reset and inspect diagnostics.";
                }
            } else {
                status.textContent = "No Grow Time available, or a growth duration is already active.";
            }
            saveAndRender();
        };
        rButton.addEventListener("click", runRestAndGrow);
        stopFlowButton.addEventListener("click", () => {
            const unused = engine.stopGrowthFlow();
            const refunded = this.growTimeController?.cancelGrowth(unused) ?? 0;
            status.textContent = `Growth flow stopped · ${refunded.toFixed(2)}s unused supply refunded`;
            this.diagnostics.info("growth-flow", "User stopped sustained growth flow.", { unusedSupplySeconds: unused, refundedSupplySeconds: refunded });
            saveAndRender();
        });

        this.growTimeKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
            const key = event.key.toLowerCase();
            if (key === (aKey.querySelector("input") as HTMLInputElement).value.toLowerCase() && !event.repeat) {
                event.preventDefault();
                applyConfig();
                this.growTimeController?.pressStack(engine.getSimulationTimeSeconds());
                saveAndRender();
            } else if (key === (bKey.querySelector("input") as HTMLInputElement).value.toLowerCase()) {
                if (!event.repeat) {
                    event.preventDefault();
                    applyConfig();
                    this.growTimeController?.beginHold(engine.getSimulationTimeSeconds());
                    bButton.textContent = "B · Release to stop";
                }
            } else if (key === (rKey.querySelector("input") as HTMLInputElement).value.toLowerCase() && !event.repeat) {
                event.preventDefault();
                runRestAndGrow();
            }
        };
        this.growTimeKeyUp = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() !== (bKey.querySelector("input") as HTMLInputElement).value.toLowerCase()) return;
            this.growTimeController?.endHold(engine.getSimulationTimeSeconds());
            bButton.textContent = "B · Hold to stack";
            saveAndRender();
        };
        window.addEventListener("keydown", this.growTimeKeyDown);
        window.addEventListener("keyup", this.growTimeKeyUp);
        conversion.addEventListener("change", () => { applyConfig(); saveAndRender(); });
        stackingToggle.addEventListener("change", () => { applyConfig(); saveAndRender(); });
        flowRate.querySelector("input")!.addEventListener("change", () => {
            const multiplier = Math.max(0.05, Number((flowRate.querySelector("input") as HTMLInputElement).value) || 1);
            if (this.growTimeController?.getState().clockState === "active") {
                this.growTimeController.setFlowMultiplier(multiplier);
                engine.setGrowthFlowMultiplier(multiplier);
                status.textContent = `Active growth flow adjusted to ${multiplier.toFixed(2)}×`;
                this.diagnostics.info("growth-flow", "Active Grow Time flow multiplier adjusted.", { flowMultiplier: multiplier });
            }
            saveAndRender();
        });

        panel.append(aButton, bButton, rButton, conversion, pressRate, holdRate, conversionRate,
            spendDuration, growthScaleRate, flowRate, stacking, aKey, bKey, rKey, readout, status, stopFlowButton);
        const renderScreen = this.controlBar.querySelector(
            ".big3r-sandbox-render-screen"
        );

        if (renderScreen) {
            renderScreen.insertAdjacentElement("afterend", panel);
        } else {
            this.controlBar.appendChild(panel);
        }
        this.renderGrowTimeState();
    }

    private loadExperientialScaleProfiles(): ExperientialScaleProfileSet | null {
        try {
            const raw = localStorage.getItem("big3r.experientialScaleProfiles.v1");
            if (!raw) return null;
            const parsed: unknown = JSON.parse(raw);
            validateExperientialScaleProfileSet(parsed);
            return parsed;
        } catch (error) {
            this.diagnostics.warn("experiential-scale", "Saved experiential-scale profiles could not be loaded.", {
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }
    private persistGrowTime(): void {
        if (!this.growTimeController || !this.growTimeStore) return;
        try { this.growTimeStore.save(this.growTimeController.createSnapshot()); }
        catch (error) {
            if (this.growTimeStatus) this.growTimeStatus.textContent = `Grow Time persistence unavailable: ${String(error)}`;
        }
    }

    private renderGrowTimeState(): void {
        if (!this.growTimeController || !this.growTimeReadout) return;
        const state = this.growTimeController.getState();
        this.growTimeReadout.textContent =
            `Stack points: ${state.stackPointsEarned.toFixed(1)} · Available Grow Time: ${state.availableGrowTimeSeconds.toFixed(1)}s · Active supply: ${state.activeGrowTimeSeconds.toFixed(1)}s @ ${state.activeFlowMultiplier.toFixed(2)}× · Phase: ${state.phase} · Clock: ${state.clockState}`;
    }

    private bindEvents(): void {
        this.propRoleSelect.addEventListener("change", () => {
            const role = this.propRoleSelect.value as PropRole;
            this.propHeightInput.value = PROP_ROLE_DEFAULT_HEIGHTS[role] || "1.0";
        });

        this.mountBtn.addEventListener("click", () => {
            void this.mount(this.glbUrlInput.value.trim(), this.overlayUrlInput.value.trim());
        });

        this.growthModeSelect.addEventListener("change", () => {
            this.activeEngine?.setMode(this.growthModeSelect.value as GrowthMode);
        });

        this.pulseBtn.addEventListener("click", () => {
            this.activeEngine?.enqueueGrowth(0.35, this.stimulusTypeSelect.value as StimulusType);
        });

        this.holdBtn.addEventListener("pointerdown", () => {
            if (!this.activeEngine) return;
            this.growthModeSelect.value = "hold";
            this.activeEngine.setMode("hold");
            this.activeEngine.startHoldGrowth();
            this.diagnostics.info("input", "Hold Charge pressed.", { input: "hold_charge", action: "begin" });
            this.holdBtn.textContent = "🔥 Charging... Release!";
        });

        const releaseHold = () => {
            if (!this.activeEngine) return;
            this.activeEngine.releaseHoldGrowth();
            this.diagnostics.info("input", "Hold Charge released.", { input: "hold_charge", action: "release" });
            this.holdBtn.textContent = "✊ Hold Charge";
        };
        this.holdBtn.addEventListener("pointerup", releaseHold);
        this.holdBtn.addEventListener("pointerleave", releaseHold);

        this.chaosBtn.addEventListener("click", () => {
            this.diagnostics.info("input", "Colossal Chaos activated.", { input: "colossal_chaos", delaySeconds: 2.0, surgeAmount: 2.6 });
            this.activeEngine?.triggerDelayedColossalChaos(2.0, 2.6);
        });

        this.resetBtn.addEventListener("click", () => {
            this.ceilingSlider.value = "3.2";
            this.ceilingVal.textContent = "3.2m";
            const engine = this.activeEngine as M1ASVFXEngine | null;
            if (engine) {
                const unused = engine.stopGrowthFlow();
                this.growTimeController?.cancelGrowth(unused);
                this.persistGrowTime();
                this.renderGrowTimeState();
                engine.resetGrowth();
            }
        });

        this.boxPresetSelect.addEventListener("change", () => {
            const h = parseFloat(this.boxPresetSelect.value);
            this.ceilingSlider.value = h.toFixed(1);
            this.ceilingVal.textContent = `${h.toFixed(1)}m`;
            this.activeEngine?.setRoomCeiling(h);
        });

        this.ceilingSlider.addEventListener("input", () => {
            const h = parseFloat(this.ceilingSlider.value);
            this.ceilingVal.textContent = `${h.toFixed(1)}m`;
            this.activeEngine?.setRoomCeiling(h);
        });

        this.cinematicCamToggle.addEventListener("change", () => {
            this.activeEngine?.setCinematicCamera(this.cinematicCamToggle.checked);
        });

        this.spawnPropBtn.addEventListener("click", async () => {
            if (!this.activeEngine) {
                alert("Launch the VFX Stage with your primary character .glb first!");
                return;
            }
            const url = this.propUrlInput.value.trim();
            if (!url) {
                alert("Paste a signed .glb URL (or click 'Sign URL' on any .glb card) first!");
                return;
            }
            try {
                await this.activeEngine.addSpatialProp(url, {
                    role: this.propRoleSelect.value as PropRole,
                    targetHeight: parseFloat(this.propHeightInput.value) || 1.0,
                    x: (Math.random() - 0.5) * 5,
                    z: (Math.random() - 0.5) * 5
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                alert(`Failed to spawn prop: ${message}`);
            }
        });

        this.respawnPropsBtn.addEventListener("click", () => {
            this.activeEngine?.resetAllProps();
        });

        this.paintRoomBtn?.addEventListener("click", async () => {
            if (!this.coordinator || !this.roomSlotSelect || !this.roomAssetTypeSelect || !this.roomValueInput) return;
            const rawSlot = this.roomSlotSelect.value;
            const slot: FaceSlotKey = rawSlot === "bg" ? "bg" : Number(rawSlot);
            const assetType = this.roomAssetTypeSelect.value as FaceAssetType;
            const value = this.roomValueInput.value.trim();
            await this.coordinator.paintRoomFace(slot, assetType, value);
        });

        this.doubleSidedToggle?.addEventListener("change", () => {
            this.coordinator?.setRoomDoubleSided(this.doubleSidedToggle!.checked);
        });

        this.exportPresetBtn?.addEventListener("click", () => {
            if (!this.coordinator) return;
            const ceiling = parseFloat(this.ceilingSlider.value) || 3.2;
            const preset = this.coordinator.exportStagePreset(this.currentBoxTier, ceiling);
            const blob = new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `big3r-stage-preset-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        this.importPresetBtn?.addEventListener("click", () => this.presetFileInput?.click());
        this.presetFileInput?.addEventListener("change", async () => {
            const file = this.presetFileInput?.files?.item(0);
            if (!file || !this.coordinator) return;
            const parsed = JSON.parse(await file.text()) as Big3rStagePreset;
            await this.coordinator.importStagePreset(parsed);
            this.presetFileInput!.value = "";
        });

        this.camRigSelect?.addEventListener("change", () => {
            if (!this.coordinator || !this.activeEngine) return;
            const mode = Number(this.camRigSelect!.value) as CameraRigMode;
            this.activeEngine.setCinematicCamera(mode === 1 ? this.cinematicCamToggle.checked : false);
            this.coordinator.setCameraRigMode(mode);
        });

        this.mountTvBtn?.addEventListener("click", () => {
            if (!this.coordinator) return;
            const overlayUrl = this.overlayUrlInput.value.trim();
            const screens = overlayUrl ? { 0: overlayUrl, 1: overlayUrl, 2: overlayUrl, 3: overlayUrl } : {};
            this.coordinator.mountFourFaceTvProp(1.8, -1.6, screens);
            if (this.camRigSelect) {
                this.camRigSelect.value = "3";
                this.activeEngine?.setCinematicCamera(false);
                this.coordinator.setCameraRigMode(3);
            }
        });

        this.loadManifestBtn?.addEventListener("click", () => this.manifestFileInput?.click());
        this.manifestFileInput?.addEventListener("change", async () => {
            const file = this.manifestFileInput?.files?.item(0);
            if (!file || !this.coordinator) return;
            const manifest = JSON.parse(await file.text()) as JSONLevelManifest;
            this.activeEngine?.setCinematicCamera(false);
            await this.coordinator.loadLevelManifest(manifest);
            this.manifestFileInput!.value = "";
        });

    }



    private updateTelemetry(state: VfxGrowthState): void {
        const tierLabel = BOX_TIER_NAMES[Math.min(state.boxTier - 1, BOX_TIER_NAMES.length - 1)];
        const rigTag = state.hasSkeleton ? `Rigged (${state.boneCount} bones)` : "Unrigged Mesh";
        const postureClass =
            state.posture === "crawl"
                ? "posture-crawl"
                : state.posture === "hunch"
                    ? "posture-hunch"
                    : "posture-stand";

        this.telemetryBadge.innerHTML = `Box ${state.boxTier}: <strong>${tierLabel}</strong> | Scale: <strong>${state.currentScale.toFixed(2)}x</strong> | Posture: <strong class="${postureClass}">${state.posture.toUpperCase()}</strong> (${Math.round(state.occupancyRatio * 100)}%) | Golden Buf: ${state.storedGoldenBuffer.toFixed(2)} | ${rigTag}`;
    }

    private renderActivePropsUI(props: SpatialProp[]): void {
        this.propListContainer.innerHTML = "";
        props.forEach((p) => {
            const chip = document.createElement("div");
            chip.className = p.broken ? "prop-chip is-broken" : "prop-chip";
            chip.innerHTML = `
                <span>${p.broken ? "💥" : "📦"} <strong>${p.role}</strong></span>
                <input type="range" class="prop-chip-slider" min="0.2" max="10.0" step="0.1" value="${p.targetHeight}" ${p.broken ? "disabled" : ""} />
                <span class="prop-h-label">${p.targetHeight.toFixed(1)}m</span>
                <button class="prop-remove-btn">✕</button>
            `;

            const slider = chip.querySelector("input[type='range']") as HTMLInputElement;
            const hLabel = chip.querySelector(".prop-h-label") as HTMLElement;
            slider.addEventListener("input", () => {
                const h = parseFloat(slider.value);
                hLabel.textContent = `${h.toFixed(1)}m`;
                this.activeEngine?.updatePropHeight(p.id, h);
            });

            chip.querySelector("button")?.addEventListener("click", () => {
                this.activeEngine?.removeProp(p.id);
            });

            this.propListContainer.appendChild(chip);
        });
    }
}
