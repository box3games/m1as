import {
    GrowthMode,
    IVfxEngine,
    PropRole,
    SpatialProp,
    StimulusType,
    VfxEngineFactory,
    VfxGrowthState
} from "../viewer/types.js";

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
                onStateChange: (state) => this.updateTelemetry(state),
                onRoomCollapse: (_newBoxTier, newCeiling) => {
                    this.ceilingSlider.value = Math.min(12, newCeiling).toFixed(1);
                    this.ceilingVal.textContent = `${newCeiling.toFixed(1)}m`;
                }
            });

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
