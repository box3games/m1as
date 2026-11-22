import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BiologicalBreathTelemetry } from './growth/model-contract.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
    GrowthEventQueue,
    GrowthStimulusType,
    GrowthEvent,
    CascadeBurstPayload,
} from './GrowthEventQueue.js';

export type GrowthTriggerMode = 'click' | 'tap' | 'hold' | 'chaos-delayed';
export type GrowthModelMode = 'm1as-vfx' | 'baseline-scale';
export type PostureState = 'stand' | 'hunch' | 'crawl';
export type SpatialPropRole =
    | 'consumable'
    | 'wearable'
    | 'container'
    | 'growth-gate'
    | 'reference';

export interface SpatialPropEntry {
    id: string;
    name: string;
    role: SpatialPropRole;
    targetHeight: number;
    position: { x: number; z: number };
    broken: boolean;
}

interface ActiveSceneProp extends SpatialPropEntry {
    root: THREE.Group;
    colliderBox: THREE.Box3;
}

export interface VFXEngineTelemetry {
    currentScale: number;
    targetScale: number;
    instability: number;
    pendingQueue: number;
    posture: PostureState;
    occupancyRatio: number;
    boxTier: number;
    storedGoldenBuffer: number;
    hasSkeleton: boolean;
    boneCount: number;
    isHolding: boolean;
    mode: GrowthTriggerMode;
}

export interface M1ASVFXEngineOptions {
    userId?: string;
    moveSpeed?: number;
    baseScale?: number;
    initialRoomCeiling?: number;
    cinematicCamera?: boolean;
    onStateChange?: (state: VFXEngineTelemetry) => void;
    onRoomCollapse?: (newBoxTier: number, newCeiling: number) => void;
    onPropsChanged?: (props: SpatialPropEntry[]) => void;
    /** Passive experiment observers; callback failures never affect simulation. */
    onFrame?: (simulationTimeSeconds: number, frameNumber: number) => void;
    onGrowthQueued?: (simulationTimeSeconds: number, frameNumber: number) => void;
    onGrowthReleased?: (event: GrowthEvent, simulationTimeSeconds: number, frameNumber: number) => void;
    onDiagnostic?: (level: "info" | "warn" | "error", category: string, message: string, data?: Record<string, unknown>) => void;
}

export class M1ASVFXEngine {
    private canvas: HTMLCanvasElement;
    private glbBlobUrl: string;
    private userId: string;

    private renderer!: THREE.WebGLRenderer;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private controls!: OrbitControls;
    private clock = new THREE.Clock();
    private simulationTimeSeconds = 0;
    private simulationFrameNumber = 0;
    private onFrame?: (simulationTimeSeconds: number, frameNumber: number) => void;
    private onGrowthQueued?: (simulationTimeSeconds: number, frameNumber: number) => void;
    private onGrowthReleased?: (event: GrowthEvent, simulationTimeSeconds: number, frameNumber: number) => void;
    private onDiagnostic?: (level: "info" | "warn" | "error", category: string, message: string, data?: Record<string, unknown>) => void;
    private frameId: number | null = null;

    // Core Growth Queue (C# Port)
    private growthQueue: GrowthEventQueue;
    private projectedTargetScale = 1.0;
    private growthModelMode: GrowthModelMode = 'm1as-vfx';
    private baselineCurrentScale = 1.0;
    private baselineTargetScale = 1.0;
    private baselineStartScale = 1.0;
    private baselineElapsedSeconds = 0;
    private baselineDurationSeconds = 0;
    private baselineDelayedEvents: Array<{ dueAt: number; amount: number; stimulus: GrowthStimulusType }> = [];
    private growFlowRemainingSeconds = 0;
    private growFlowMultiplier = 1;
    private growFlowGrowthPerSupplySecond = 0.1;
    private growFlowStimulus: GrowthStimulusType = GrowthStimulusType.Buff;

    // Subject, Rig & AnimationMixer
    private subjectRoot = new THREE.Group();
    private loadedModel: THREE.Object3D | null = null;
    private mixer: THREE.AnimationMixer | null = null;
    private actions = new Map<string, THREE.AnimationAction>();
    private activeAction: THREE.AnimationAction | null = null;
    private bones = new Map<string, THREE.Bone>();
    private subjectMaterials: THREE.MeshStandardMaterial[] = [];
    private baseModelHeight = 1.0;

    // Golden-Ratio Body Orchestration (phi = 1.618)
    private readonly PHI = 1.61803398875;
    private upperBodyExcess = 0.0;
    private storedGoldenBuffer = 0.0;

    // Box-Within-a-Box Spatial Progression & Posture
    private boxTier = 1;
    private roomCeilingHeight: number;
    private ceilingMesh!: THREE.Mesh;
    private posture: PostureState = 'stand';

    // Multi-.glb Spatial Props & Threshold-Break Collisions
    private sceneProps = new Map<string, ActiveSceneProp>();
    private onPropsChanged?: (props: SpatialPropEntry[]) => void;

    // Venous Pulse & Fractal Bulge
    private pulsePhase = 0;
    private venousPulseEnergy = 0;
    private biologicalVisualExpansion = 0;
    private biologicalInternalPressure = 0;
    private biologicalPressureWave = 0;

    // Input & Controls
    private mode: GrowthTriggerMode = 'click';
    private isHolding = false;
    private holdDuration = 0;
    private keysPressed = new Set<string>();
    private moveSpeed: number;
    private isMovingBackward = false;
    private raycaster = new THREE.Raycaster();
    private pointerDownPos = new THREE.Vector2();

    // Cinematic Camera Amplification
    private cinematicCamera: boolean;
    private baseFov = 45;
    private currentFovKick = 0;

    // Transparent .webm VFX Overlays
    private vfxBlobUrl: string | null = null;
    private activeVfxPlanes: Array<{
        mesh: THREE.Mesh;
        video: HTMLVideoElement;
        texture: THREE.VideoTexture;
    }> = [];
    private activeRings: Array<{ mesh: THREE.Mesh; age: number; maxAge: number; maxRadius: number }> = [];

    private onStateChange?: (state: VFXEngineTelemetry) => void;
    private onRoomCollapse?: (newBoxTier: number, newCeiling: number) => void;

    constructor(canvas: HTMLCanvasElement, glbBlobUrl: string, options: M1ASVFXEngineOptions = {}) {
        this.canvas = canvas;
        this.glbBlobUrl = glbBlobUrl;
        this.userId = options.userId ?? 'dev-user';
        this.moveSpeed = options.moveSpeed ?? 3.8;
        this.roomCeilingHeight = options.initialRoomCeiling ?? 3.2;
        this.cinematicCamera = options.cinematicCamera ?? true;
        this.onStateChange = options.onStateChange;
        this.onRoomCollapse = options.onRoomCollapse;
        this.onPropsChanged = options.onPropsChanged;
        this.onFrame = options.onFrame;
        this.onGrowthQueued = options.onGrowthQueued;
        this.onGrowthReleased = options.onGrowthReleased;
        this.onDiagnostic = options.onDiagnostic;

        const startScale = options.baseScale ?? 1.0;
        this.projectedTargetScale = startScale;
        this.growthQueue = new GrowthEventQueue(startScale);
        this.growthQueue.onEventReleased = (event) => {
            try { this.onGrowthReleased?.({ ...event }, this.simulationTimeSeconds, this.simulationFrameNumber); }
            catch { /* observers cannot affect queue scheduling or character response */ }
        };
        this.growthQueue.onCascadeBurst = (burst) => this.handleCascadeBurst(burst);

        this.init();
    }

    private init(): void {
        const width = this.canvas.clientWidth || 640;
        const height = this.canvas.clientHeight || 420;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
        });
        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b1120);

        const grid = new THREE.GridHelper(30, 30, 0x38bdf8, 0x1e293b);
        this.scene.add(grid);

        const ceilingGeo = new THREE.PlaneGeometry(14, 14);
        const ceilingMat = new THREE.MeshBasicMaterial({
            color: 0x10b981,
            transparent: true,
            opacity: 0.14,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        this.ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingMat);
        this.ceilingMesh.rotation.x = Math.PI / 2;
        this.ceilingMesh.position.y = this.roomCeilingHeight;
        this.scene.add(this.ceilingMesh);

        this.camera = new THREE.PerspectiveCamera(this.baseFov, width / height, 0.1, 250);
        this.camera.position.set(0, 2.2, 5.8);

        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.target.set(0, 0.8, 0);

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
        dirLight.position.set(6, 12, 8);
        this.scene.add(dirLight);

        this.scene.add(this.subjectRoot);
        this.loadGlb();

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        this.canvas.addEventListener('pointerdown', this.onPointerDown);
        this.canvas.addEventListener('pointerup', this.onPointerUp);

        this.animate = this.animate.bind(this);
        this.animate();
    }

    private loadGlb(): void {
        new GLTFLoader().load(
            this.glbBlobUrl,
            (gltf) => {
                this.loadedModel = gltf.scene;
                this.bones.clear();
                this.subjectMaterials = [];

                const box = new THREE.Box3().setFromObject(this.loadedModel);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z) || 1;
                const normFactor = 1.2 / maxDim;

                this.loadedModel.scale.setScalar(normFactor);
                this.loadedModel.position.set(
                    -center.x * normFactor,
                    -box.min.y * normFactor,
                    -center.z * normFactor
                );
                this.baseModelHeight = size.y * normFactor;

                this.loadedModel.traverse((node) => {
                    if ((node as THREE.Bone).isBone) {
                        this.bones.set(node.name.toLowerCase(), node as THREE.Bone);
                    }
                    if ((node as THREE.Mesh).isMesh) {
                        const mesh = node as THREE.Mesh;
                        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                        mats.forEach((m) => {
                            if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                                this.subjectMaterials.push(m as THREE.MeshStandardMaterial);
                            }
                        });
                    }
                });

                if (gltf.animations && gltf.animations.length > 0) {
                    this.mixer = new THREE.AnimationMixer(this.loadedModel);
                    for (const clip of gltf.animations) {
                        const action = this.mixer.clipAction(clip);
                        this.actions.set(clip.name.toLowerCase(), action);
                    }
                    this.playAnimation('idle');
                }

                const loadData = { boneCount: this.bones.size, animationClips: Array.from(this.actions.keys()), normalizedHeight: this.baseModelHeight };
                try { this.onDiagnostic?.("info", "asset-load", "M1AS VFX engine loaded GLB subject.", loadData); } catch { /* diagnostics cannot affect engine */ }
                this.subjectRoot.add(this.loadedModel);
                this.emitTelemetry();
            },
            undefined,
            (err) => {
                try { this.onDiagnostic?.("error", "asset-load", "M1AS VFX engine failed to load GLB subject.", { error: String(err) }); } catch { /* diagnostics cannot affect engine */ }
            }
        );


    }

    private spawnGroundShockwave(worldPos: THREE.Vector3, radius: number, colorHex = 0x10b981): void {
        const geo = new THREE.RingGeometry(0.15, 0.35, 36);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        const ring = new THREE.Mesh(geo, mat);
        ring.position.set(worldPos.x, 0.02, worldPos.z);
        this.scene.add(ring);
        this.activeRings.push({ mesh: ring, age: 0, maxAge: 0.65, maxRadius: radius });
    }
    // =========================================================================
    // PUBLIC GROWTH, STIMULUS & CAMERA CONTROLS
    // =========================================================================

    public getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    public getScene(): THREE.Scene { return this.scene; }
    public getCamera(): THREE.PerspectiveCamera { return this.camera; }
    public getRenderer(): THREE.WebGLRenderer { return this.renderer; }
    public getControls(): OrbitControls { return this.controls; }
    public getSubjectRoot(): THREE.Group { return this.subjectRoot; }
    public getCurrentVisualScale(): number { return this.growthModelMode === 'baseline-scale' ? this.baselineCurrentScale : this.growthQueue.currentVisualScale; }
    public getGrowthModel(): GrowthModelMode { return this.growthModelMode; }
    public setGrowthModel(mode: GrowthModelMode): boolean {
        if (mode === this.growthModelMode) return true;
        if (this.isHolding || this.growFlowRemainingSeconds > 0) return false;
        if (this.growthModelMode === 'm1as-vfx') {
            const queueSettled =
                this.growthQueue.pendingCount === 0 &&
                Math.abs(this.growthQueue.currentVisualScale - this.growthQueue.currentTargetScale) <= 0.002 &&
                Math.abs(this.growthQueue.currentGrowthVelocity) <= 0.02 &&
                this.growthQueue.currentInstability <= 0.02;
            if (!queueSettled) return false;
        } else if (this.baselineDelayedEvents.length > 0 || Math.abs(this.baselineCurrentScale - this.baselineTargetScale) > 0.000001) {
            return false;
        }
        if (mode === 'baseline-scale') {
            this.baselineCurrentScale = this.growthQueue.currentVisualScale;
            this.baselineTargetScale = this.baselineCurrentScale;
            this.baselineStartScale = this.baselineCurrentScale;
            this.subjectRoot.scale.setScalar(this.baselineCurrentScale);
            this.resetBonesToIdentity();
            this.posture = 'stand';
            this.upperBodyExcess = 0;
            this.storedGoldenBuffer = 0;
            this.venousPulseEnergy = 0;
            for (const material of this.subjectMaterials) material.emissiveIntensity = 0;
        } else {
            this.growthQueue.reset(this.baselineCurrentScale);
            this.projectedTargetScale = this.baselineCurrentScale;
            this.subjectRoot.scale.set(1, 1, 1);
            this.resetBonesToIdentity();
            this.upperBodyExcess = 0;
            this.storedGoldenBuffer = 0;
            this.posture = 'stand';
        }
        this.growthModelMode = mode;
        this.emitTelemetry();
        try { this.onDiagnostic?.('info', 'growth-model', 'Growth model switched.', { model: mode, currentScale: this.getCurrentVisualScale() }); } catch { /* observer isolation */ }
        return true;
    }
    /** Read-only queue and character diagnostics for interchangeable-model adapters. */
    public getGrowthModelTelemetry(): { currentScale: number; targetScale: number; projectedTargetScale: number; growthVelocity: number; instability: number; pendingEvents: number; posture: PostureState; goldenBuffer: number; isHolding: boolean; biologicalVisualExpansion: number; biologicalInternalPressure: number; biologicalPressureWave: number } {
        return {
            currentScale: this.getCurrentVisualScale(),
            targetScale: this.growthModelMode === 'baseline-scale' ? this.baselineTargetScale : this.growthQueue.currentTargetScale,
            projectedTargetScale: this.growthModelMode === 'baseline-scale' ? this.baselineTargetScale : this.projectedTargetScale,
            growthVelocity: this.growthModelMode === 'baseline-scale' && this.baselineDurationSeconds > 0
                ? (this.baselineTargetScale - this.baselineStartScale) / this.baselineDurationSeconds
                : this.growthQueue.currentGrowthVelocity,
            instability: this.growthModelMode === 'baseline-scale' ? 0 : this.growthQueue.currentInstability,
            pendingEvents: this.growthModelMode === 'baseline-scale'
                ? this.baselineDelayedEvents.length + (this.baselineCurrentScale !== this.baselineTargetScale ? 1 : 0)
                : this.growthQueue.pendingCount,
            posture: this.posture,
            goldenBuffer: this.storedGoldenBuffer,
            isHolding: this.isHolding,
            biologicalVisualExpansion: this.biologicalVisualExpansion,
            biologicalInternalPressure: this.biologicalInternalPressure,
            biologicalPressureWave: this.biologicalPressureWave,
        };
    }
    /** Elapsed simulation time accumulated from this engine's existing frame dt. */
    public getSimulationTimeSeconds(): number { return this.simulationTimeSeconds; }

    /** Begin or replace a sustained supply feed. Supply is measured in Grow Time seconds. */
    public startGrowthFlow(
        supplySeconds: number,
        flowMultiplier = 1,
        growthPerSupplySecond = 0.1,
        stimulus: GrowthStimulusType = GrowthStimulusType.Buff,
    ): boolean {
        if (this.growthModelMode !== 'm1as-vfx') return false;
        if (!Number.isFinite(supplySeconds) || supplySeconds <= 0 ||
            !Number.isFinite(flowMultiplier) || flowMultiplier <= 0 ||
            !Number.isFinite(growthPerSupplySecond) || growthPerSupplySecond < 0) return false;
        this.growFlowRemainingSeconds = supplySeconds;
        this.growFlowMultiplier = flowMultiplier;
        this.growFlowGrowthPerSupplySecond = growthPerSupplySecond;
        this.growFlowStimulus = stimulus;
        try {
            this.onDiagnostic?.('info', 'growth-flow', 'Sustained Grow Time supply started.', {
                supplySeconds, flowMultiplier, growthPerSupplySecond, stimulus,
            });
        } catch { /* diagnostics cannot affect simulation */ }
        return true;
    }

    public setGrowthFlowMultiplier(multiplier: number): boolean {
        if (!Number.isFinite(multiplier) || multiplier <= 0 || this.growFlowRemainingSeconds <= 0) return false;
        this.growFlowMultiplier = multiplier;
        try { this.onDiagnostic?.('info', 'growth-flow', 'Sustained growth flow rate changed.', { flowMultiplier: multiplier, supplyRemainingSeconds: this.growFlowRemainingSeconds }); } catch { /* diagnostics cannot affect simulation */ }
        return true;
    }

    public stopGrowthFlow(): number {
        const remaining = this.growFlowRemainingSeconds;
        if (remaining <= 0) return 0;
        this.growFlowRemainingSeconds = 0;
        try { this.onDiagnostic?.('info', 'growth-flow', 'Sustained growth flow stopped.', { unusedSupplySeconds: remaining }); } catch { /* diagnostics cannot affect simulation */ }
        return remaining;
    }

    public getGrowthFlowTelemetry(): { active: boolean; supplyRemainingSeconds: number; flowMultiplier: number; growthPerSupplySecond: number } {
        return {
            active: this.growFlowRemainingSeconds > 0,
            supplyRemainingSeconds: this.growFlowRemainingSeconds,
            flowMultiplier: this.growFlowMultiplier,
            growthPerSupplySecond: this.growFlowGrowthPerSupplySecond,
        };
    }


    /** Apply continuous biological growth without manufacturing discrete queue events. */
    public applyBiologicalBreathState(state: BiologicalBreathTelemetry, growthDelta: number): void {
        if (!Number.isFinite(growthDelta) || growthDelta < 0) return;
        if (growthDelta > 0 && this.growthModelMode === 'm1as-vfx') {
            this.growthQueue.feedSustainedGrowth(growthDelta, GrowthStimulusType.Buff);
            this.projectedTargetScale += growthDelta;
            this.upperBodyExcess += growthDelta * 0.25;
        }
        this.biologicalVisualExpansion = Math.max(0, Math.min(1, state.visualExpansion));
        this.biologicalInternalPressure = Math.max(0, state.internalPressure);
        this.biologicalPressureWave = Number.isFinite(state.pressureWave) ? state.pressureWave : 0;
        this.venousPulseEnergy = Math.max(
            this.venousPulseEnergy,
            Math.min(1, this.biologicalInternalPressure * 0.15 + this.biologicalVisualExpansion * 0.2),
        );
    }

    public setTransparentBackground(transparent: boolean): void {
        if (transparent) {
            this.scene.background = null;
            this.renderer.setClearColor(0x000000, 0);
        } else {
            this.scene.background = new THREE.Color(0x0b1120);
        }
    }

    public setMode(mode: GrowthTriggerMode): void {
        this.mode = mode;
        this.isHolding = false;
        this.holdDuration = 0;
        this.emitTelemetry();
    }

    public setCinematicCamera(enabled: boolean): void {
        this.cinematicCamera = enabled;
    }

    public setRoomCeiling(height: number): void {
        this.roomCeilingHeight = Math.max(1.5, height);
        this.ceilingMesh.position.y = this.roomCeilingHeight;
        this.emitTelemetry();
    }

    public setOnPropsChanged(cb: (props: SpatialPropEntry[]) => void): void {
        this.onPropsChanged = cb;
        this.notifyPropsChanged();
    }

    public resetGrowth(): void {
        this.boxTier = 1;
        this.roomCeilingHeight = 3.2;
        this.ceilingMesh.position.y = this.roomCeilingHeight;
        this.projectedTargetScale = 1.0;
        this.baselineCurrentScale = 1.0;
        this.baselineTargetScale = 1.0;
        this.baselineStartScale = 1.0;
        this.baselineElapsedSeconds = 0;
        this.baselineDurationSeconds = 0;
        this.baselineDelayedEvents = [];
        this.growFlowRemainingSeconds = 0;
        this.growFlowMultiplier = 1;
        this.growFlowGrowthPerSupplySecond = 0.1;
        this.upperBodyExcess = 0.0;
        this.storedGoldenBuffer = 0.0;
        this.biologicalVisualExpansion = 0;
        this.biologicalInternalPressure = 0;
        this.biologicalPressureWave = 0;
        this.posture = 'stand';
        this.growthQueue.reset(1.0);
        this.subjectRoot.position.set(0, 0, 0);
        this.subjectRoot.rotation.set(0, 0, 0);
        this.subjectRoot.scale.set(1, 1, 1);
        this.resetBonesToIdentity();
        this.emitTelemetry();
    }

    public enqueueGrowth(
        amount = 0.35,
        stimulus: GrowthStimulusType = GrowthStimulusType.Consumption,
        customDelay?: number
    ): void {
        if (this.growthModelMode === 'baseline-scale') {
            const delay = customDelay ?? (this.mode === 'chaos-delayed' ? 1.8 + Math.random() * 1.2 : 0);
            if (delay > 0) this.baselineDelayedEvents.push({ dueAt: this.simulationTimeSeconds + delay, amount, stimulus });
            else {
                const transition = this.beginBaselineGrowth(amount);
                if (transition) this.notifyBaselineGrowthReleased(amount, stimulus, transition);
            }
            try { this.onGrowthQueued?.(this.simulationTimeSeconds, this.simulationFrameNumber); } catch { /* observer isolation */ }
            this.emitTelemetry();
            return;
        }
        const oldScale = this.projectedTargetScale;

        if (stimulus === GrowthStimulusType.Exercise || stimulus === GrowthStimulusType.Buff) {
            const goldenCap = this.projectedTargetScale * (this.PHI - 1.0);
            if (this.upperBodyExcess + amount > goldenCap) {
                const overflow = this.upperBodyExcess + amount - goldenCap;
                this.storedGoldenBuffer += overflow;
                amount = Math.max(0.05, amount - overflow);
            }
            this.upperBodyExcess += amount * 0.5;
        } else if (this.storedGoldenBuffer > 0) {
            const release = Math.min(this.storedGoldenBuffer, amount * 0.8);
            this.storedGoldenBuffer -= release;
            amount += release;
            this.upperBodyExcess = Math.max(0, this.upperBodyExcess - release * 0.5);
        }

        const newScale = oldScale + amount;
        this.projectedTargetScale = newScale;

        this.venousPulseEnergy = Math.min(1.0, this.venousPulseEnergy + 0.45);

        const delay = this.mode === 'chaos-delayed' ? 1.8 + Math.random() * 1.2 : customDelay;
        this.growthQueue.push(oldScale, newScale, stimulus, delay);
        try { this.onGrowthQueued?.(this.simulationTimeSeconds, this.simulationFrameNumber); } catch { /* observers cannot affect growth */ }
        this.emitTelemetry();
    }

    public startHoldGrowth(): void {
        this.isHolding = true;
        this.holdDuration = 0;
        this.emitTelemetry();
    }

    public releaseHoldGrowth(): void {
        if (!this.isHolding) return;
        this.isHolding = false;
        const bonus = Math.min(3.0, this.holdDuration * 1.25);
        this.holdDuration = 0;
        this.enqueueGrowth(0.3 + bonus, GrowthStimulusType.Buff);
    }

    public triggerDelayedColossalChaos(delaySeconds = 2.0, surgeAmount = 2.6): void {
        this.venousPulseEnergy = 1.0;
        this.enqueueGrowth(surgeAmount, GrowthStimulusType.Environmental, delaySeconds);
    }

     private handleCascadeBurst(burst: CascadeBurstPayload): void {
    const scale = this.growthQueue.currentVisualScale;
    this.spawnVfxAtPosition(
      this.subjectRoot.position,
      Math.max(1.8, this.baseModelHeight * scale * 1.45)
    );
    this.spawnGroundShockwave(
      this.subjectRoot.position,
      Math.max(1.2, scale * 1.1),
      0x10b981
    );
    this.currentFovKick = Math.min(9.0, 3.0 + burst.bugKineticKick * 1.4);

    if (this.actions.has('grow_surge')) {
      this.playOneShotAnimation('grow_surge');
    }
  }




    // =========================================================================
    // MULTI-.GLB SPATIAL PROPS & THRESHOLD-BREAK COLLISIONS
    // =========================================================================

    public async addSpatialProp(
        glbSignedUrl: string,
        options: {
            name?: string;
            role?: SpatialPropRole;
            targetHeight?: number;
            x?: number;
            z?: number;
        } = {}
    ): Promise<string> {
        let res: Response;
        try {
            res = await fetch(glbSignedUrl, { headers: { 'm1as-user-id': this.userId } });
        } catch (error) {
            try { this.onDiagnostic?.("error", "prop-stream", "Spatial prop GLB request failed.", { error: String(error), propName: options.name ?? "unnamed" }); } catch { /* diagnostics cannot affect engine */ }
            throw error;
        }
        if (!res.ok) {
            const error = new Error(`Prop GLB stream failed (${res.status})`);
            try { this.onDiagnostic?.("error", "prop-stream", "Spatial prop GLB request returned an unsuccessful status.", { status: res.status, propName: options.name ?? "unnamed" }); } catch { /* diagnostics cannot affect engine */ }
            throw error;
        }
        const propBlob = await res.blob();
        try { this.onDiagnostic?.("info", "prop-stream", "Spatial prop GLB downloaded.", { byteLength: propBlob.size, contentType: propBlob.type || "unknown", propName: options.name ?? "unnamed" }); } catch { /* diagnostics cannot affect engine */ }
        const blobUrl = URL.createObjectURL(propBlob);

        const id = `prop-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const role = options.role ?? 'consumable';
        const targetHeight = options.targetHeight ?? 0.5;
        const posX = options.x ?? (Math.random() - 0.5) * 6;
        const posZ = options.z ?? (Math.random() - 0.5) * 6;

        return new Promise((resolve, reject) => {
            new GLTFLoader().load(
                blobUrl,
                (gltf) => {
                    URL.revokeObjectURL(blobUrl);
                    const model = gltf.scene;

                    const box = new THREE.Box3().setFromObject(model);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    const rawHeight = size.y || 1;
                    const scaleFactor = targetHeight / rawHeight;

                    model.scale.setScalar(scaleFactor);
                    model.position.set(
                        -center.x * scaleFactor,
                        -box.min.y * scaleFactor,
                        -center.z * scaleFactor
                    );

                    const propRoot = new THREE.Group();
                    propRoot.position.set(posX, 0, posZ);
                    propRoot.add(model);
                    this.scene.add(propRoot);

                    const propEntry: ActiveSceneProp = {
                        id,
                        name: options.name ?? `${role.toUpperCase()} (${targetHeight.toFixed(2)}m)`,
                        role,
                        targetHeight,
                        position: { x: posX, z: posZ },
                        broken: false,
                        root: propRoot,
                        colliderBox: new THREE.Box3().setFromObject(propRoot),
                    };

                    this.sceneProps.set(id, propEntry);
                    try { this.onDiagnostic?.("info", "prop-load", "Spatial prop GLB loaded into the scene.", { propId: id, name: propEntry.name, role, targetHeight, measuredDimensions: { x: size.x * scaleFactor, y: size.y * scaleFactor, z: size.z * scaleFactor } }); } catch { /* diagnostics cannot affect engine */ }
                    this.notifyPropsChanged();
                    resolve(id);
                },
                undefined,
                (err) => {
                    URL.revokeObjectURL(blobUrl);
                    try { this.onDiagnostic?.("error", "prop-load", "Spatial prop GLB could not be decoded or loaded.", { propName: options.name ?? "unnamed", error: String(err) }); } catch { /* diagnostics cannot affect engine */ }
                    reject(err);
                }
            );
        });
    }

    public updatePropHeight(propId: string, newHeight: number): void {
        const prop = this.sceneProps.get(propId);
        if (!prop || prop.broken) return;

        const clampedHeight = Math.max(0.1, newHeight);
        const ratio = clampedHeight / prop.targetHeight;
        prop.root.scale.multiplyScalar(ratio);
        prop.targetHeight = clampedHeight;
        prop.colliderBox.setFromObject(prop.root);
        this.notifyPropsChanged();
    }

    public removeProp(propId: string): void {
        const prop = this.sceneProps.get(propId);
        if (!prop) return;
        this.scene.remove(prop.root);
        this.sceneProps.delete(propId);
        this.notifyPropsChanged();
    }

    public resetAllProps(): void {
        this.sceneProps.forEach((prop) => {
            prop.broken = false;
            prop.root.visible = true;
            prop.colliderBox.setFromObject(prop.root);
        });
        this.notifyPropsChanged();
    }

    private notifyPropsChanged(): void {
        if (!this.onPropsChanged) return;
        const list: SpatialPropEntry[] = Array.from(this.sceneProps.values()).map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            targetHeight: p.targetHeight,
            position: p.position,
            broken: p.broken,
        }));
        this.onPropsChanged(list);
    }

    private checkPropCollisionsAndBreaks(): void {
        if (!this.loadedModel || this.sceneProps.size === 0) return;

        const playerBox = new THREE.Box3().setFromObject(this.subjectRoot);
        const playerHeight = playerBox.max.y - playerBox.min.y;

        this.sceneProps.forEach((prop) => {
            if (prop.broken || prop.role === 'reference') return;

            prop.colliderBox.setFromObject(prop.root);
            if (!playerBox.intersectsBox(prop.colliderBox)) return;

            const requiredHeightRatio =
                prop.role === 'consumable' ? 0.65 : prop.role === 'wearable' ? 0.85 : 1.02;

            if (playerHeight >= prop.targetHeight * requiredHeightRatio) {
                this.breakOrAbsorbProp(prop);
            }
        });
    }

      private breakOrAbsorbProp(prop: ActiveSceneProp): void {
    prop.broken = true;
    prop.root.visible = false;

    const roleMultiplier =
      prop.role === 'growth-gate'
        ? 1.15
        : prop.role === 'container'
          ? 0.85
          : prop.role === 'wearable'
            ? 0.65
            : 0.45;

    const stimulus =
      prop.role === 'wearable'
        ? GrowthStimulusType.Buff
        : prop.role === 'growth-gate' || prop.role === 'container'
          ? GrowthStimulusType.Environmental
          : GrowthStimulusType.Consumption;

    const growthGain = Math.max(0.25, prop.targetHeight * roleMultiplier);

    this.spawnVfxAtPosition(prop.root.position, Math.max(1.5, prop.targetHeight * 1.6));
    this.spawnGroundShockwave(
      prop.root.position,
      Math.max(1.0, prop.targetHeight * 1.2),
      prop.role === 'growth-gate' ? 0xa855f7 : 0x38bdf8
    );
    this.enqueueGrowth(growthGain, stimulus);
    this.notifyPropsChanged();
  }

    // =========================================================================
    // GOLDEN-RATIO BONES, VENOUS PULSE & CEILING POSTURE SOLVER
    // =========================================================================

    private applyOrganicAndBoneScaling(dt: number, finalScale: number, instability: number): void {
        this.pulsePhase += dt * (8.0 + instability * 10.0);

        const hasPending = this.growthQueue.pendingCount > 0;
        if (hasPending) {
            this.venousPulseEnergy = Math.min(1.0, this.venousPulseEnergy + dt * 0.8);
        } else {
            this.venousPulseEnergy = Math.max(0.0, this.venousPulseEnergy - dt * 1.2);
        }

        const veinWave = (Math.sin(this.pulsePhase * 1.6) * 0.5 + 0.5) * this.venousPulseEnergy;
        for (const mat of this.subjectMaterials) {
            if (mat.emissive) {
                mat.emissive.setHex(0x10b981);
                mat.emissiveIntensity = veinWave * 0.45;
            }
        }

        const fractalPulse =
            (Math.sin(this.pulsePhase) * 0.6 + Math.sin(this.pulsePhase * 2.17) * 0.4) *
            (0.03 * this.venousPulseEnergy + instability * 0.04 + this.biologicalVisualExpansion * 0.018 + this.biologicalPressureWave * 0.012);

        const rawHeight = this.baseModelHeight * finalScale;
        const occupancyRatio = rawHeight / this.roomCeilingHeight;

        let postureYMultiplier = 1.0;
        let postureXZMultiplier = 1.0;
        let nextPosture: PostureState = 'stand';

        if (occupancyRatio >= 0.92) {
            nextPosture = 'crawl';
            postureYMultiplier = 0.52;
            postureXZMultiplier = 1.24;
        } else if (occupancyRatio >= 0.75) {
            nextPosture = 'hunch';
            postureYMultiplier = 0.78;
            postureXZMultiplier = 1.12;
        }

        if (nextPosture !== this.posture) {
            this.posture = nextPosture;
            this.updateLocomotionAnimation(this.isMoving());
        }

        if (occupancyRatio >= 1.05) {
            this.triggerBoxProgression();
            return;
        }

        const sx = finalScale * postureXZMultiplier * (1 + fractalPulse);
        const sy = finalScale * postureYMultiplier * (1 - fractalPulse * 0.5);
        const sz = finalScale * postureXZMultiplier * (1 + fractalPulse);
        this.subjectRoot.scale.set(sx, sy, sz);

        if (this.bones.size > 0) {
            const goldenArmRatio = Math.min(
                1.22,
                1.0 + (this.upperBodyExcess / Math.max(finalScale, 1)) * 0.35
            );
            const spineBend = this.posture === 'crawl' ? 0.85 : this.posture === 'hunch' ? 0.42 : 0.0;

            this.bones.forEach((bone, name) => {
                if (name.includes('spine') || name.includes('chest')) {
                    bone.scale.set(goldenArmRatio + fractalPulse, 1.0, goldenArmRatio + fractalPulse);
                    bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, spineBend, dt * 8);
                } else if (name.includes('arm') || name.includes('shoulder')) {
                    bone.scale.setScalar(goldenArmRatio);
                } else if (name.includes('thigh') || name.includes('leg')) {
                    const legBalance = 1.0 + (goldenArmRatio - 1.0) * 0.85;
                    bone.scale.setScalar(legBalance);
                }
            });
        }
    }

    private triggerBoxProgression(): void {
        this.boxTier += 1;
        this.roomCeilingHeight *= 2.4;
        this.ceilingMesh.position.y = this.roomCeilingHeight;
        this.posture = 'stand';
        this.spawnVfxAtPosition(
            this.subjectRoot.position,
            Math.max(2.0, this.baseModelHeight * this.growthQueue.currentVisualScale * 1.5)
        );
        this.currentFovKick = 8.0;
        this.onRoomCollapse?.(this.boxTier, this.roomCeilingHeight);
    }

    private resetBonesToIdentity(): void {
        this.bones.forEach((bone) => {
            bone.scale.set(1, 1, 1);
            bone.rotation.set(0, 0, 0);
        });
    }

    // =========================================================================
    // ANIMATION MIXER & WALK FORWARD / BACKWARD LOCOMOTION
    // =========================================================================

    private isMoving(): boolean {
        return (
            this.keysPressed.has('KeyW') ||
            this.keysPressed.has('KeyS') ||
            this.keysPressed.has('ArrowUp') ||
            this.keysPressed.has('ArrowDown') ||
            this.keysPressed.has('KeyA') ||
            this.keysPressed.has('KeyD') ||
            this.keysPressed.has('ArrowLeft') ||
            this.keysPressed.has('ArrowRight')
        );
    }

    private updateLocomotionAnimation(moving: boolean): void {
        if (!this.mixer || this.actions.size === 0) return;

        let targetClip = 'idle';
        let timeScale = 1.0;

        if (this.posture === 'crawl') {
            targetClip = this.actions.has('crawl') ? 'crawl' : 'idle';
            timeScale = moving ? (this.isMovingBackward ? -1.0 : 1.0) : 0.0;
        } else if (this.posture === 'hunch') {
            targetClip = this.actions.has('hunch')
                ? 'hunch'
                : this.actions.has('walk')
                    ? 'walk'
                    : 'idle';
            timeScale = moving ? (this.isMovingBackward ? -0.85 : 0.85) : 0.2;
        } else if (moving) {
            if (this.isMovingBackward && this.actions.has('walk_backward')) {
                targetClip = 'walk_backward';
            } else if (this.actions.has('walk')) {
                targetClip = 'walk';
                timeScale = this.isMovingBackward ? -1.0 : 1.0;
            }
        }

        this.playAnimation(targetClip, timeScale);
    }

    private playAnimation(name: string, timeScale = 1.0): void {
        const next = this.actions.get(name) ?? this.actions.values().next().value;
        if (!next) return;

        next.timeScale = timeScale;
        if (this.activeAction === next) return;

        next.reset().play();
        if (this.activeAction) {
            next.crossFadeFrom(this.activeAction, 0.22, true);
        }
        this.activeAction = next;
    }

    private playOneShotAnimation(name: string): void {
        const action = this.actions.get(name);
        if (!action) return;
        action.reset().setLoop(THREE.LoopOnce, 1).play();
    }

    private updateMovement(dt: number): void {
        let forward = 0;
        let strafe = 0;

        if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) forward += 1;
        if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) forward -= 1;
        if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) strafe -= 1;
        if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) strafe += 1;

        const moving = forward !== 0 || strafe !== 0;
        this.isMovingBackward = forward < 0;

        if (moving) {
            const strideSpeed = this.moveSpeed * (1 + (this.growthQueue.currentVisualScale - 1) * 0.35);
            const len = Math.hypot(forward, strafe);
            const normF = forward / len;
            const normS = strafe / len;

            this.subjectRoot.position.z -= normF * strideSpeed * dt;
            this.subjectRoot.position.x += normS * strideSpeed * dt;

            if (forward >= 0) {
                const targetYaw = Math.atan2(normS, -normF);
                this.subjectRoot.rotation.y = THREE.MathUtils.lerp(
                    this.subjectRoot.rotation.y,
                    targetYaw,
                    dt * 10
                );
            }
        }

        this.updateLocomotionAnimation(moving);
    }

    // =========================================================================
    // CINEMATIC CAMERA AMPLIFICATION
    // =========================================================================

    private updateCinematicCamera(dt: number, currentScale: number, instability: number): void {
        if (this.currentFovKick > 0.01) {
            this.currentFovKick = THREE.MathUtils.lerp(this.currentFovKick, 0, dt * 4.5);
        } else {
            this.currentFovKick = 0;
        }
        this.camera.fov = this.baseFov + this.currentFovKick;
        this.camera.updateProjectionMatrix();

        if (!this.cinematicCamera) return;

        const charHeight =
            this.baseModelHeight * currentScale * (this.posture === 'crawl' ? 0.55 : 1.0);
        const desiredTarget = new THREE.Vector3(
            this.subjectRoot.position.x,
            Math.max(0.6, charHeight * 0.58),
            this.subjectRoot.position.z
        );

        if (instability > 0.15) {
            desiredTarget.x += (Math.random() - 0.5) * instability * 0.08;
            desiredTarget.y += (Math.random() - 0.5) * instability * 0.08;
        }

        this.controls.target.lerp(desiredTarget, dt * 5.5);

        const desiredDist = Math.max(4.8, charHeight * 2.4);
        const currentOffset = this.camera.position.clone().sub(this.controls.target);
        const currentDist = currentOffset.length() || 1;
        const blendedDist = THREE.MathUtils.lerp(currentDist, desiredDist, dt * 3.0);

        currentOffset.normalize().multiplyScalar(blendedDist);
        currentOffset.y = Math.max(0.7, charHeight * 0.38);
        this.camera.position.copy(this.controls.target).add(currentOffset);
    }

    // =========================================================================
    // INPUT & .WEBM VFX HELPERS
    // =========================================================================

    private onKeyDown(e: KeyboardEvent): void {
        if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
        this.keysPressed.add(e.code);

        if (e.code === 'Space' && !e.repeat) {
            e.preventDefault();
            if (this.mode === 'hold') this.startHoldGrowth();
            else this.enqueueGrowth(0.35, GrowthStimulusType.Consumption);
        }
    }

    private onKeyUp(e: KeyboardEvent): void {
        this.keysPressed.delete(e.code);
        if (e.code === 'Space' && this.mode === 'hold') {
            this.releaseHoldGrowth();
        }
    }

    private onPointerDown(e: PointerEvent): void {
        this.pointerDownPos.set(e.clientX, e.clientY);
    }

    private onPointerUp(e: PointerEvent): void {
        const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
        if (dist > 6 || !this.loadedModel) return;

        const rect = this.canvas.getBoundingClientRect();
        const ndc = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );

        this.raycaster.setFromCamera(ndc, this.camera);
        if (this.raycaster.intersectObject(this.loadedModel, true).length > 0) {
            this.enqueueGrowth(0.35, GrowthStimulusType.ToolActivation);
        }
    }

    public async setVfxWebm(signedOrBlobUrl: string): Promise<void> {
        if (this.vfxBlobUrl) {
            URL.revokeObjectURL(this.vfxBlobUrl);
            this.vfxBlobUrl = null;
        }
        if (!signedOrBlobUrl) return;
        if (signedOrBlobUrl.startsWith('blob:')) {
            this.vfxBlobUrl = signedOrBlobUrl;
        } else {
            const res = await fetch(signedOrBlobUrl, { headers: { 'm1as-user-id': this.userId } });
            if (!res.ok) throw new Error(`VFX stream failed (${res.status})`);
            this.vfxBlobUrl = URL.createObjectURL(await res.blob());
        }
    }
    private spawnVfxAtPosition(worldPos: THREE.Vector3, size: number): void {
        if (!this.vfxBlobUrl) return;
        const video = document.createElement('video');
        video.src = this.vfxBlobUrl;
        video.muted = true;
        video.loop = false;
        video.playsInline = true;
        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        const geo = new THREE.PlaneGeometry(size, size);
        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const plane = new THREE.Mesh(geo, mat);
        plane.position.set(worldPos.x, size * 0.45, worldPos.z);
        plane.quaternion.copy(this.camera.quaternion);
        this.scene.add(plane);
        const entry = { mesh: plane, video, texture };
        this.activeVfxPlanes.push(entry);
        const cleanup = () => {
            this.scene.remove(plane);
            geo.dispose();
            mat.dispose();
            texture.dispose();
            video.src = '';
            this.activeVfxPlanes = this.activeVfxPlanes.filter((p) => p !== entry);
        };
        video.onended = cleanup;
        video.play().catch(cleanup);
    }
    private beginBaselineGrowth(amount: number): { oldScale: number; newScale: number } | null {
        if (!Number.isFinite(amount) || amount <= 0) return null;
        const oldScale = Math.max(this.baselineCurrentScale, this.baselineTargetScale);
        this.baselineStartScale = this.baselineCurrentScale;
        this.baselineTargetScale = oldScale + amount;
        this.baselineElapsedSeconds = 0;
        this.baselineDurationSeconds = Math.max(0.75, (this.baselineTargetScale - this.baselineCurrentScale) * 2.0);
        return { oldScale, newScale: this.baselineTargetScale };
    }

    private notifyBaselineGrowthReleased(
        amount: number,
        stimulus: GrowthStimulusType,
        transition: { oldScale: number; newScale: number },
    ): void {
        try {
            this.onGrowthReleased?.({
                oldScale: transition.oldScale, newScale: transition.newScale,
                delta: amount, growthPressure: 0, type: stimulus,
                entropyImpact: 0, delayWeight: 0,
            }, this.simulationTimeSeconds, this.simulationFrameNumber);
        } catch { /* observer isolation */ }
    }

    private advanceBaselineGrowth(dt: number): void {
        this.baselineDelayedEvents.sort((a, b) => a.dueAt - b.dueAt);
        while (this.baselineDelayedEvents.length > 0 && this.simulationTimeSeconds >= this.baselineDelayedEvents[0].dueAt) {
            const event = this.baselineDelayedEvents.shift()!;
            const transition = this.beginBaselineGrowth(event.amount);
            if (!transition) continue;
            this.notifyBaselineGrowthReleased(event.amount, event.stimulus, transition);
        }
        if (this.baselineDurationSeconds > 0 && this.baselineCurrentScale !== this.baselineTargetScale) {
            this.baselineElapsedSeconds = Math.min(this.baselineDurationSeconds, this.baselineElapsedSeconds + dt);
            const t = this.baselineElapsedSeconds / this.baselineDurationSeconds;
            const eased = t * t * (3 - 2 * t);
            this.baselineCurrentScale = this.baselineStartScale + (this.baselineTargetScale - this.baselineStartScale) * eased;
            if (t >= 1) {
                this.baselineCurrentScale = this.baselineTargetScale;
                this.baselineDurationSeconds = 0;
            }
        }
        this.subjectRoot.scale.setScalar(this.baselineCurrentScale);
    }

    private emitTelemetry(): void {
        const currentScale = this.getCurrentVisualScale();
        const occupancyRatio = (this.baseModelHeight * currentScale) / this.roomCeilingHeight;
        this.onStateChange?.({
            currentScale: Number(currentScale.toFixed(2)),
            targetScale: Number((this.growthModelMode === 'baseline-scale' ? this.baselineTargetScale : this.growthQueue.currentTargetScale).toFixed(2)),
            instability: Number((this.growthModelMode === 'baseline-scale' ? 0 : this.growthQueue.currentInstability).toFixed(2)),
            pendingQueue: this.growthModelMode === 'baseline-scale' ? this.baselineDelayedEvents.length + (this.baselineCurrentScale !== this.baselineTargetScale ? 1 : 0) : this.growthQueue.pendingCount,
            posture: this.posture,
            occupancyRatio: Number(occupancyRatio.toFixed(2)),
            boxTier: this.boxTier,
            storedGoldenBuffer: Number(this.storedGoldenBuffer.toFixed(2)),
            hasSkeleton: this.bones.size > 0,
            boneCount: this.bones.size,
            isHolding: this.isHolding,
            mode: this.mode,
        });
    }
      private animate(): void {
    this.frameId = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.simulationTimeSeconds += dt;
    this.simulationFrameNumber += 1;

    if (this.isHolding) {
      this.holdDuration += dt;
      this.venousPulseEnergy = Math.min(1.0, 0.3 + this.holdDuration * 0.4);
    }

    if (this.mixer) {
      this.mixer.update(dt);
    }

    this.updateMovement(dt);
    this.checkPropCollisionsAndBreaks();

    if (this.growthModelMode === 'm1as-vfx' && this.growFlowRemainingSeconds > 0) {
      const suppliedDelta = Math.min(this.growFlowRemainingSeconds, dt * this.growFlowMultiplier);
      this.growFlowRemainingSeconds = Math.max(0, this.growFlowRemainingSeconds - suppliedDelta);
      const growthDelta = suppliedDelta * this.growFlowGrowthPerSupplySecond;
      if (growthDelta > 0) {
        this.growthQueue.feedSustainedGrowth(growthDelta, this.growFlowStimulus);
        this.projectedTargetScale += growthDelta;
        this.upperBodyExcess += growthDelta * 0.25;
        this.venousPulseEnergy = Math.min(1, this.venousPulseEnergy + suppliedDelta * 0.15);
      }
      if (this.growFlowRemainingSeconds === 0) {
        try { this.onDiagnostic?.('info', 'growth-flow', 'Sustained Grow Time supply depleted.', { simulationTimeSeconds: this.simulationTimeSeconds, projectedTargetScale: this.projectedTargetScale }); } catch { /* diagnostics cannot affect simulation */ }
      }
    }
    const queueTelemetry = this.growthQueue.step(dt);
    let cameraScale = queueTelemetry.absoluteFinalScale;
    let cameraInstability = queueTelemetry.instabilityScore;
    if (this.growthModelMode === 'baseline-scale') {
      this.advanceBaselineGrowth(dt);
      cameraScale = this.baselineCurrentScale;
      cameraInstability = 0;
    } else {
      this.applyOrganicAndBoneScaling(dt, queueTelemetry.absoluteFinalScale, queueTelemetry.instabilityScore);
    }
    this.updateCinematicCamera(dt, cameraScale, cameraInstability);

    // Update expanding ground shockwave rings
    for (let i = this.activeRings.length - 1; i >= 0; i--) {
      const r = this.activeRings[i];
      r.age += dt;
      const t = Math.min(1, r.age / r.maxAge);
      const easeOut = 1 - Math.pow(1 - t, 3);
      const s = 1 + easeOut * r.maxRadius * 3.0;
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;

      if (t >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.activeRings.splice(i, 1);
      }
    }

    for (const vfx of this.activeVfxPlanes) {
      vfx.mesh.quaternion.copy(this.camera.quaternion);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.emitTelemetry();
    try { this.onFrame?.(this.simulationTimeSeconds, this.simulationFrameNumber); } catch { /* observers cannot interrupt rendering */ }
  }

    public destroy(): void {
        if (this.frameId !== null) cancelAnimationFrame(this.frameId);
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas.removeEventListener('pointerup', this.onPointerUp);
        if (this.vfxBlobUrl) URL.revokeObjectURL(this.vfxBlobUrl);
        this.controls.dispose();
        this.renderer.dispose();
    }
}