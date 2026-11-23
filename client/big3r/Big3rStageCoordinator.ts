import * as THREE from 'three';
import type { M1ASVFXEngine } from '../M1ASVFXEngine.js';
import { M1ASFaceSurfaceResolver, type FaceAssetType } from '../M1ASFaceSurfaceResolver.js';
import type { ManagedTextureHandle } from '../textures/ResolveM1ASTexture.js';
import { LevelOrchestrator } from '../big3r/LevelOrchestrator.js';
import type { JSONLevelManifest } from './streaming/manifest-types.js';
import { ScaleRebaseController, type RebaseStateSnapshot } from './scale/ScaleRebaseController.js';
import {
    GrowthCurveStateMachine,
    type Big3rGrowthCurveConfig,
} from './scale/GrowthCurveStateMachine.js';
import { CameraRig5Mode, type CameraRigMode } from './camera/CameraRig5Mode.js';
import { EmissiveFourFaceTvProp } from './visuals/Big3rVisualEffects.js';
import { TelemetryHud } from '../big3r/hud/TelemetryHUD.js';
import type { PortableAnchorSnapshot } from '../evaluation/portable-anchor-contract.js';
import type {
    Big3rRoomSlotPreset,
    Big3rStagePreset,
    FaceSlotKey,
    PropClickTrigger,
    PropVfxLayerOptions,
} from '../viewer/types.js';

export class Big3rStageCoordinator {
    private readonly engine: M1ASVFXEngine;
    private readonly userId: string;
    private readonly surfaceResolver: M1ASFaceSurfaceResolver;

    private roomBoxMesh!: THREE.Mesh;
    private roomFaceMaterials: THREE.MeshStandardMaterial[] = [];
    private roomSlotConfigs = new Map<FaceSlotKey, Big3rRoomSlotPreset>();
    private doubleSidedRoom = false;

    private readonly levelOrchestrator: LevelOrchestrator;
    private readonly scaleRebase: ScaleRebaseController;
    private lastRebaseSnapshot: RebaseStateSnapshot | null = null;
    private readonly growthCurve = new GrowthCurveStateMachine();
    private readonly cameraRig: CameraRig5Mode;

    private telemetryHud: TelemetryHud | null = null;
    private tvProp: EmissiveFourFaceTvProp | null = null;
    private streamingManifestActive = false;
    private rafId: number | null = null;
    private lastTs = performance.now();

    private readonly propTextureHandles = new Map<string, ManagedTextureHandle>();
    private readonly propOverlays = new Map<
        string,
        { mesh: THREE.Mesh; video: HTMLVideoElement; texture: THREE.VideoTexture; options: PropVfxLayerOptions }
    >();
    private readonly propClickTriggers = new Map<string, PropClickTrigger>();
    private readonly activeAudio = new Set<HTMLAudioElement>();
    private readonly raycaster = new THREE.Raycaster();
    private readonly pointerDownPos = new THREE.Vector2();


    constructor(engine: M1ASVFXEngine, userId = 'dev-user', initialCeiling = 3.2) {
        this.engine = engine;
        this.userId = userId;
        this.surfaceResolver = new M1ASFaceSurfaceResolver(userId);
        this.levelOrchestrator = new LevelOrchestrator(engine.getScene(), userId, 4);
        this.scaleRebase = new ScaleRebaseController(this.levelOrchestrator);
        this.cameraRig = new CameraRig5Mode(engine.getCamera(), engine.getControls());

        this.initRoomBox(initialCeiling);
        this.startTick();
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        const canvas = this.engine.getCanvas();
        canvas.addEventListener('pointerdown', this.onPointerDown);
        canvas.addEventListener('pointerup', this.onPointerUp);

        
    }

    

    private initRoomBox(ceilingHeight: number): void {
        const size = Math.max(14, ceilingHeight * 2.8);
        const geo = new THREE.BoxGeometry(size, ceilingHeight, size);
        this.roomFaceMaterials = Array.from({ length: 6 }, (_, idx) => {
            return new THREE.MeshStandardMaterial({
                color: idx === 3 ? 0x0f172a : 0x1e293b,
                roughness: 0.85,
                metalness: 0.05,
                transparent: true,
                opacity: idx === 2 ? 0.25 : 0.92,
                side: THREE.BackSide,
            });
        });
        this.roomBoxMesh = new THREE.Mesh(geo, this.roomFaceMaterials);
        this.roomBoxMesh.position.y = ceilingHeight * 0.5;
        this.engine.getScene().add(this.roomBoxMesh);
    }

    public getRoomDoubleSided(): boolean {
        return this.doubleSidedRoom;
    }

    public setRoomDoubleSided(enabled: boolean): void {
        this.doubleSidedRoom = enabled;
        const side = enabled ? THREE.DoubleSide : THREE.BackSide;
        for (const mat of this.roomFaceMaterials) {
            mat.side = side;
            mat.needsUpdate = true;
        }
    }

    public async paintRoomFace(
        slot: FaceSlotKey,
        assetType: FaceAssetType,
        value: string,
        label?: string
    ): Promise<void> {
        this.roomSlotConfigs.set(slot, { slot, assetType, value, label });
        const scene = this.engine.getScene();

        if (slot === 'bg') {
            this.surfaceResolver.cleanupSlot('room_bg');
            if (assetType === 'color') {
                scene.background = new THREE.Color(value || '#0b1120');
                return;
            }
            const tex = await this.surfaceResolver.resolveBackgroundTexture('room_bg', assetType, value, label);
            if (tex) scene.background = tex;
            return;
        }

        const idx = Number(slot);
        const mat = this.roomFaceMaterials[idx];
        if (!mat) return;
        await this.surfaceResolver.applyToMaterial(`room_face_${idx}`, mat, assetType, value, label);
        mat.side = this.doubleSidedRoom ? THREE.DoubleSide : THREE.BackSide;
        mat.needsUpdate = true;
    }
    public attachTelemetryHud(container: HTMLElement): void {
        this.telemetryHud = new TelemetryHud(container);
    }

    public attachHeightReticle(el: HTMLElement): void {
        this.cameraRig.attachHeightReticle(el);
    }


    /**
     * Read-only live anchor capture. Character top/bottom are measured geometry
     * bounds, not inferred anatomical landmarks. Camera and stage references
     * remain in stage-world coordinates for reproducible comparison.
     */
    public getPortableAnchorSnapshot(
        subjectId: string,
        configurationVersion: string,
    ): PortableAnchorSnapshot | { status: "not_captured"; reason: string } {
        if (!subjectId.trim() || !configurationVersion.trim()) {
            return { status: "not_captured", reason: "Subject identity and configuration version are required." };
        }
        const subject = this.engine.getSubjectRoot();
        subject.updateWorldMatrix(true, true);
        const bounds = new THREE.Box3().setFromObject(subject);
        if (bounds.isEmpty()) {
            return { status: "not_captured", reason: "The active character has no measurable geometry bounds yet." };
        }
        const origin = subject.getWorldPosition(new THREE.Vector3());
        const camera = this.engine.getCamera();
        camera.updateWorldMatrix(true, false);
        const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
        const focus = this.engine.getControls().target;
        const stageId = `big3r-stage:${this.engine.getScene().uuid}`;
        const cameraId = `big3r-camera:${camera.uuid}`;
        const source = "big3r-three-runtime";
        const sourceVersion = "1.0.0";
        const vector = (value: THREE.Vector3) => ({ x: value.x, y: value.y, z: value.z });
        const anchor = (
            anchorId: string,
            ownerId: string,
            group: "character" | "stage" | "camera",
            semantic: string,
            position: THREE.Vector3,
        ) => ({
            anchorId, ownerId, group, semantic, coordinateSpace: "stage-world" as const,
            position: vector(position), access: "read-only" as const, source, sourceVersion,
        });
        return {
            schemaVersion: "big3r-portable-anchors/1.0",
            capturedAtSimulationTimeSeconds: this.engine.getSimulationTimeSeconds(),
            configurationVersion,
            anchors: [
                anchor("subject-origin", subjectId, "character", "subject-root-origin", origin),
                anchor("subject-bounds-bottom", subjectId, "character", "measured-world-bounds-bottom", new THREE.Vector3(
                    (bounds.min.x + bounds.max.x) * 0.5, bounds.min.y, (bounds.min.z + bounds.max.z) * 0.5,
                )),
                anchor("subject-bounds-top", subjectId, "character", "measured-world-bounds-top", new THREE.Vector3(
                    (bounds.min.x + bounds.max.x) * 0.5, bounds.max.y, (bounds.min.z + bounds.max.z) * 0.5,
                )),
                anchor("stage-origin", stageId, "stage", "scene-world-origin", new THREE.Vector3(0, 0, 0)),
                anchor("camera-position", cameraId, "camera", "camera-world-position", cameraPosition),
                anchor("camera-focus", cameraId, "camera", "orbit-controls-world-focus", focus),
            ],
        };
    }

    public getCameraRigMode(): CameraRigMode {
        return this.cameraRig.getMode();
    }

    public setCameraRigMode(mode: CameraRigMode): void {
        this.cameraRig.setMode(mode);
    }

    public loadGrowthCurveConfig(config: Big3rGrowthCurveConfig): void {
        this.growthCurve.loadConfig(config);
    }

    /** Read-only physical growth value from the active growth model. */
    public getActualScaleEvaluationSnapshot(): {
        growthModel: string;
        currentVisualScale: number;
    } {
        return {
            growthModel: this.engine.getGrowthModel(),
            currentVisualScale: this.engine.getCurrentVisualScale(),
        };
    }

    /**
     * Read-only stage-relative state from the active manifest and native
     * ScaleRebaseController. No presentation scale is inferred from camera data.
     */
    public getStageScaleEvaluationSnapshot():
        | {
            status: "available";
            activeTierId: string;
            activeTierName: string;
            metricHeight: number;
            normalizedPlayerScale: number;
            activeTierWorldScale: number;
            prewarmedTierWorldScale: number;
            progress01: number;
            rebaseCount: number;
            effectiveMetricHeight: number;
          }
        | { status: "not_captured"; reason: string } {
        const manifest = this.levelOrchestrator.getActiveManifest();
        const snapshot = this.lastRebaseSnapshot;
        if (!this.streamingManifestActive || !manifest || !snapshot) {
            return {
                status: "not_captured",
                reason: "A streaming stage manifest and its first ScaleRebaseController frame are required.",
            };
        }
        return {
            status: "available",
            activeTierId: manifest.tierId,
            activeTierName: manifest.displayName,
            metricHeight: manifest.metricHeight,
            normalizedPlayerScale: snapshot.normalizedPlayerScale,
            activeTierWorldScale: snapshot.activeTierWorldScale,
            prewarmedTierWorldScale: snapshot.prewarmedTierWorldScale,
            progress01: snapshot.progress01,
            rebaseCount: snapshot.rebaseCount,
            effectiveMetricHeight: snapshot.effectiveMetricHeight,
        };
    }

    public async loadLevelManifest(manifest: JSONLevelManifest): Promise<void> {
        await this.levelOrchestrator.loadManifest(manifest);
        this.scaleRebase.reset();
        this.lastRebaseSnapshot = null;
        this.streamingManifestActive = true;
        this.roomBoxMesh.visible = false;
    }

    public mountFourFaceTvProp(
        x = 1.8,
        z = -1.6,
        screenWebmUrls: Partial<Record<0 | 1 | 2 | 3, string>> = {}
    ): EmissiveFourFaceTvProp {
        if (this.tvProp) {
            this.engine.getScene().remove(this.tvProp.root);
            this.tvProp.destroy();
        }
        this.tvProp = new EmissiveFourFaceTvProp(1.15);
        this.tvProp.root.position.set(x, 0, z);
        for (let i = 0; i < 4; i++) {
            const idx = i as 0 | 1 | 2 | 3;
            const url = screenWebmUrls[idx];
            if (url) this.tvProp.bindScreenVideo(idx, url);
        }
        this.engine.getScene().add(this.tvProp.root);
        return this.tvProp;
    }

    public exportStagePreset(boxTier: number, ceilingHeight: number): Big3rStagePreset {
        return {
            version: 1,
            boxTier,
            roomCeilingHeight: ceilingHeight,
            doubleSidedRoom: this.doubleSidedRoom,
            roomSlots: Array.from(this.roomSlotConfigs.values()),
            props: [],
        };
    }

    public async importStagePreset(preset: Big3rStagePreset): Promise<void> {
        this.setRoomDoubleSided(Boolean(preset.doubleSidedRoom));
        this.engine.setRoomCeiling(preset.roomCeilingHeight || 3.2);
        for (const slotCfg of preset.roomSlots) {
            await this.paintRoomFace(slotCfg.slot, slotCfg.assetType, slotCfg.value, slotCfg.label);
        }
    }

        private onPointerDown(e: PointerEvent): void {
        this.pointerDownPos.set(e.clientX, e.clientY);
    }

    private onPointerUp(e: PointerEvent): void {
        const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
        if (dist > 6 || !this.tvProp || this.cameraRig.getMode() !== 3) return;

        const canvas = this.engine.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const ndc = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );

        this.raycaster.setFromCamera(ndc, this.engine.getCamera());
        if (this.raycaster.intersectObject(this.tvProp.root, true).length > 0) {
            this.tvProp.rotateNextFace();
        }
    }


    private startTick(): void {
        const tick = (now: number) => {
            const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTs) / 1000));
            this.lastTs = now;

            const visualScale = this.engine.getCurrentVisualScale();
            const curveOut = this.growthCurve.evaluate(visualScale);

            if (this.streamingManifestActive) {
                void this.scaleRebase
                    .update(visualScale, this.engine.getSubjectRoot())
                    .then((rebaseSnap) => {
                        this.lastRebaseSnapshot = rebaseSnap;
                        this.levelOrchestrator.updateFrame(this.engine.getCamera(), rebaseSnap.progress01);
                        this.cameraRig.update(
                            dt,
                            this.engine.getSubjectRoot(),
                            rebaseSnap.normalizedPlayerScale,
                            curveOut,
                            this.tvProp?.root.position
                        );
                        this.telemetryHud?.tick(
                            this.engine.getRenderer(),
                            this.levelOrchestrator.getTelemetry(),
                            rebaseSnap,
                            curveOut.phase,
                            this.cameraRig.getMode()
                        );
                    });
            }

            this.tvProp?.update(dt);
            this.surfaceResolver.tickAudioVisualizers();
            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }

    public destroy(): void {
        if (this.rafId !== null) cancelAnimationFrame(this.rafId);
        
        const canvas = this.engine.getCanvas();
        canvas.removeEventListener('pointerdown', this.onPointerDown);
        canvas.removeEventListener('pointerup', this.onPointerUp);

        this.propOverlays.forEach((o) => {
            o.mesh.parent?.remove(o.mesh);
            o.mesh.geometry.dispose();
            (o.mesh.material as THREE.Material).dispose();
            o.texture.dispose();
            o.video.pause();
            o.video.removeAttribute('src');
            o.video.load();
        });
        this.propOverlays.clear();
        this.propTextureHandles.forEach((h) => h.dispose());
        this.propTextureHandles.clear();
        this.activeAudio.forEach((a) => {
            a.pause();
            a.removeAttribute('src');
            a.load();
        });
        this.activeAudio.clear();
        this.levelOrchestrator.destroy();
        this.surfaceResolver.destroy();
        this.tvProp?.destroy();
        this.engine.getScene().remove(this.roomBoxMesh);
        this.roomBoxMesh.geometry.dispose();
        this.roomFaceMaterials.forEach((m) => m.dispose());
    }
}
