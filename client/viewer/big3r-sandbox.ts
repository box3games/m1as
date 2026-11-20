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
import { Big3rStageCoordinator } from "../big3r/Big3rStageCoordinator.js";
import type { FaceAssetType } from "../M1ASFaceSurfaceResolver.js";
import type { JSONLevelManifest } from "../big3r/streaming/manifest-types.js";
import type { CameraRigMode } from "../big3r/camera/CameraRig5Mode.js";
import type { Big3rStagePreset, FaceSlotKey } from "./types.js";
import { EXPERIMENT_SCHEMA_VERSION } from "../experiments/contracts.js";
import type { ExperimentManifest } from "../experiments/contracts.js";
import { DEFAULT_CAPTURE_PROFILES } from "../experiments/capture-profiles.js";
import { ExperimentCoordinator, type PresentationSamplePayload } from "../experiments/coordinator.js";
import { BrowserDownloadExperimentStorage } from "../experiments/browser-download-storage.js";
import { captureCharacterPresentation, capturePerspectiveCamera } from "../experiments/three-adapters.js";


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
    private activeEngine: IVfxEngine | null = null;

    private coordinator: Big3rStageCoordinator | null = null;
    private experimentCoordinator: ExperimentCoordinator | null = null;
    private experimentStorage: BrowserDownloadExperimentStorage | null = null;
    private experimentControls: HTMLElement | null = null;
    private experimentStatus: HTMLElement | null = null;
    private experimentExportLink: HTMLAnchorElement | null = null;
    private currentBoxTier = 1;

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

        await this.activeEngine.addSpatialProp(signedUrl, {
            name: displayName,
            role: this.propRoleSelect.value as PropRole,
            targetHeight: parseFloat(this.propHeightInput.value) || 0.6,
            x: (Math.random() - 0.5) * 5,
            z: (Math.random() - 0.5) * 5
        });
    }

    async mount(glbSignedUrl: string, vfxWebmSignedUrl = ""): Promise<void> {
        if (!glbSignedUrl || !glbSignedUrl.trim()) {
            alert("Please provide a valid .glb signed URL first.");
            return;
        }

        this.glbUrlInput.value = glbSignedUrl;

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
                    this.experimentCoordinator?.tick(simulationTimeSeconds, frameNumber);
                },
                onGrowthQueued: (simulationTimeSeconds, frameNumber) => {
                    this.experimentCoordinator?.trigger("growth_queued", simulationTimeSeconds, frameNumber);
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

            this.installExperimentControls(this.activeEngine as unknown as M1ASVFXEngine);

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
        panel.className = "m1as-experiment-controls";
        panel.style.display = "flex";
        panel.style.flexWrap = "wrap";
        panel.style.alignItems = "center";
        panel.style.gap = "8px";
        panel.style.margin = "8px 0";

        const profileSelect = document.createElement("select");
        for (const profileName of ["lightweight", "detailed", "discovery"] as const) {
            const option = document.createElement("option");
            option.value = profileName;
            option.textContent = profileName;
            profileSelect.appendChild(option);
        }
        const start = document.createElement("button");
        start.type = "button";
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
                    growth: "legacy-growth-queue",
                    camera: "runtime-perspective-camera",
                    world: "sandbox-stage",
                },
            };
            const storage = new BrowserDownloadExperimentStorage((url, fileName) => {
                exportLink.href = url;
                exportLink.download = fileName;
                exportLink.hidden = false;
                status.textContent = "Experiment finalized and ready to download.";
            });
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
                        cameraMode: "sandbox",
                    });
                    const character = captureCharacterPresentation(
                        engine.getSubjectRoot(), engine.getCamera(), manifest.worldUnit,
                    );
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
                onCaptureError: (error) => {
                    status.textContent = `Capture warning: ${String(error)}`;
                },
            });
            this.experimentStorage = storage;
            this.experimentCoordinator = coordinator;
            try {
                await coordinator.start();
                start.disabled = true;
                stop.disabled = false;
                exportLink.hidden = true;
                status.textContent = `Recording ${experimentId} · ${profile.name} profile`;
            } catch (error) {
                this.experimentCoordinator = null;
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
            } catch (error) {
                status.textContent = `Finalize warning: ${String(error)}`;
                start.disabled = false;
            }
        });

        if (previousExport) {
            exportLink.href = previousExport.href;
            exportLink.download = previousExport.download;
            exportLink.hidden = false;
        }
        panel.append(profileSelect, start, stop, status, exportLink);
        this.controlBar.appendChild(panel);
        this.experimentControls = panel;
        this.experimentStatus = status;
        this.experimentExportLink = exportLink;
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
            this.holdBtn.textContent = "🔥 Charging... Release!";
        });

        const releaseHold = () => {
            if (!this.activeEngine) return;
            this.activeEngine.releaseHoldGrowth();
            this.holdBtn.textContent = "✊ Hold Charge";
        };
        this.holdBtn.addEventListener("pointerup", releaseHold);
        this.holdBtn.addEventListener("pointerleave", releaseHold);

        this.chaosBtn.addEventListener("click", () => {
            this.activeEngine?.triggerDelayedColossalChaos(2.0, 2.6);
        });

        this.resetBtn.addEventListener("click", () => {
            this.ceilingSlider.value = "3.2";
            this.ceilingVal.textContent = "3.2m";
            this.activeEngine?.resetGrowth();
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
