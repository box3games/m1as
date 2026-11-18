import * as THREE from 'three';
import { MapEngine, type BuiltTierScene } from './MapEngine.js';
import { AssetEngine } from './AssetEngine.js';
import type {
  JSONLevelManifest,
  PortalRect2D,
  ScaleTierManifest,
} from './streaming/manifest-types.js';

export interface OrchestratorTelemetry {
  activeTierId: string;
  activeTierName: string;
  metricHeight: number;
  prewarmedTierId: string | null;
  visiblePortals: number;
  totalPortals: number;
  activeVideoDecoders: number;
  activeTextures: number;
}

export class LevelOrchestrator {
  private readonly scene: THREE.Scene;
  private readonly mapEngine: MapEngine;
  private readonly assetEngine: AssetEngine;
  private readonly manifestMap = new Map<string, ScaleTierManifest>();

  private activeTier: BuiltTierScene | null = null;
  private activeManifest: ScaleTierManifest | null = null;

  private prewarmedTier: BuiltTierScene | null = null;
  private prewarmedManifest: ScaleTierManifest | null = null;
  private isPrewarming = false;

  private lastPortalRects: PortalRect2D[] = [];

  constructor(scene: THREE.Scene, userId = 'dev-user', maxVideoDecoders = 4) {
    this.scene = scene;
    this.mapEngine = new MapEngine();
    this.assetEngine = new AssetEngine(userId, maxVideoDecoders);
  }

  public async loadManifest(manifest: JSONLevelManifest): Promise<void> {
    this.disposeAllTiers();
    this.manifestMap.clear();
    for (const tier of manifest.tiers) {
      this.manifestMap.set(tier.tierId, tier);
    }
    await this.activateTier(manifest.initialTierId);
  }

  public getActiveManifest(): ScaleTierManifest | null {
    return this.activeManifest;
  }

  public getActiveTierGroup(): THREE.Group | null {
    return this.activeTier?.group ?? null;
  }

  public getPrewarmedTierGroup(): THREE.Group | null {
    return this.prewarmedTier?.group ?? null;
  }

  public getPortalRects(): PortalRect2D[] {
    return this.lastPortalRects;
  }

  public async activateTier(tierId: string): Promise<void> {
    const manifest = this.manifestMap.get(tierId);
    if (!manifest) throw new Error(`Unknown ScaleTier "${tierId}"`);

    const previousTier = this.activeTier;
    const previousId = this.activeManifest?.tierId ?? null;

    // Promote prewarmed tier if it matches target tierId
    if (this.prewarmedTier && this.prewarmedManifest?.tierId === tierId) {
      this.activeTier = this.prewarmedTier;
      this.activeManifest = this.prewarmedManifest;
      this.activeTier.group.scale.setScalar(1.0);
      this.activeTier.group.visible = true;
      this.prewarmedTier = null;
      this.prewarmedManifest = null;
    } else {
      const built = await this.hydrateTierScene(manifest);
      built.group.scale.setScalar(1.0);
      this.scene.add(built.group);
      this.activeTier = built;
      this.activeManifest = manifest;
    }

    // Atomic sawtooth disposal of prior tier
    if (previousTier && previousId && previousId !== tierId) {
      this.scene.remove(previousTier.group);
      previousTier.dispose();
      this.assetEngine.releaseTier(previousId);
    }
  }

  /**
   * Pre-warms ST_N+1 at 2.0x scale so ScaleRebaseController can snap seamlessly
   * with zero frame hitch or VRAM spike.
   */
  public async prewarmNextTier(): Promise<void> {
    const nextId = this.activeManifest?.nextTierId;
    if (!nextId || this.isPrewarming || this.prewarmedManifest?.tierId === nextId) {
      return;
    }
    const nextManifest = this.manifestMap.get(nextId);
    if (!nextManifest) return;

    this.isPrewarming = true;
    try {
      const built = await this.hydrateTierScene(nextManifest);
      built.group.scale.setScalar(2.0);
      built.group.visible = true;
      this.scene.add(built.group);
      this.prewarmedTier = built;
      this.prewarmedManifest = nextManifest;
    } finally {
      this.isPrewarming = false;
    }
  }

  /**
   * Per-frame update: culls 2D portal rects against the camera frustum and
   * pauses/resumes offscreen <video> decoders.
   */
  public updateFrame(camera: THREE.Camera, normalizedProgress01: number): void {
    if (normalizedProgress01 >= 0.72 && this.activeManifest?.nextTierId) {
      void this.prewarmNextTier();
    }

    if (!this.activeTier || !this.activeManifest) {
      this.lastPortalRects = [];
      return;
    }

    this.activeTier.group.updateMatrixWorld(true);
    const rects: PortalRect2D[] = [];

    for (const portal of this.activeTier.portals) {
      const rect = this.mapEngine.computePortalRect2D(
        portal,
        this.activeTier.group.matrixWorld,
        camera
      );
      rects.push(rect);
      portal.mesh.visible = rect.visible;
      this.assetEngine.setSlotPlaybackVisible(
        this.activeManifest.tierId,
        portal.slotId,
        rect.visible
      );
    }

    this.lastPortalRects = rects;
  }

  public getTelemetry(): OrchestratorTelemetry {
    return {
      activeTierId: this.activeManifest?.tierId ?? 'none',
      activeTierName: this.activeManifest?.displayName ?? 'Unloaded',
      metricHeight: this.activeManifest?.metricHeight ?? 0,
      prewarmedTierId: this.prewarmedManifest?.tierId ?? null,
      visiblePortals: this.lastPortalRects.filter((r) => r.visible).length,
      totalPortals: this.lastPortalRects.length,
      activeVideoDecoders: this.assetEngine.getActiveVideoDecoderCount(),
      activeTextures: this.assetEngine.getActiveTextureCount(),
    };
  }

  private async hydrateTierScene(manifest: ScaleTierManifest): Promise<BuiltTierScene> {
    const built = this.mapEngine.buildTierGeometry(manifest);

    for (const slotDef of manifest.slots) {
      if (!slotDef.assetUrl || !slotDef.mimeType) continue;
      const slot = built.slots.get(slotDef.slotId);
      if (!slot) continue;

      try {
        const tex = await this.assetEngine.acquireSlotTexture(
          manifest.tierId,
          slotDef.slotId,
          slotDef.assetUrl,
          slotDef.mimeType,
          slotDef.label
        );
        slot.material.map = tex;
        slot.material.color.setHex(0xffffff);
        slot.material.needsUpdate = true;
      } catch (err) {
        console.warn(`[LevelOrchestrator] Slot "${slotDef.slotId}" fallback material:`, err);
      }
    }

    return built;
  }

  private disposeAllTiers(): void {
    if (this.activeTier && this.activeManifest) {
      this.scene.remove(this.activeTier.group);
      this.activeTier.dispose();
      this.assetEngine.releaseTier(this.activeManifest.tierId);
    }
    if (this.prewarmedTier && this.prewarmedManifest) {
      this.scene.remove(this.prewarmedTier.group);
      this.prewarmedTier.dispose();
      this.assetEngine.releaseTier(this.prewarmedManifest.tierId);
    }
    this.activeTier = null;
    this.activeManifest = null;
    this.prewarmedTier = null;
    this.prewarmedManifest = null;
  }

  public destroy(): void {
    this.disposeAllTiers();
    this.assetEngine.destroy();
  }
}
