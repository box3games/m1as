import * as THREE from "three";
import type {
  PresentationAccentApplyResult,
  PresentationAccentEffectHost,
} from "../experiments/presentation-accent-adapter.js";

export interface PresentationEffectTarget {
  readonly targetId: string;
  apply(channelId: string, value: number): PresentationAccentApplyResult;
  clear(channelId: string): void;
  clearAllExcept?(activeChannelIds: ReadonlySet<string>): void;
  update?(deltaSeconds: number): void;
  dispose?(): void;
}

/** Reusable VFXR target registry. Targets are registered by capability, not hard-coded profile branches. */
export class VfxrPresentationEffectRegistry implements PresentationAccentEffectHost {
  public readonly presentationAccentHostId = "vfxr-presentation-effects";
  private readonly targets = new Map<string, PresentationEffectTarget>();

  public register(target: PresentationEffectTarget): () => void {
    if (!target.targetId.trim()) throw new TypeError("Presentation effect targetId is required.");
    if (this.targets.has(target.targetId)) {
      throw new Error(`Presentation effect target "${target.targetId}" is already registered.`);
    }
    this.targets.set(target.targetId, target);
    return () => {
      if (this.targets.get(target.targetId) !== target) return;
      this.targets.delete(target.targetId);
      target.dispose?.();
    };
  }

  public applyPresentationAccent(
    channelId: string,
    targetId: string,
    value: number,
  ): PresentationAccentApplyResult {
    if (!Number.isFinite(value)) return { status: "failed", reason: "Accent value must be finite." };
    const target = this.targets.get(targetId);
    if (!target) return { status: "unsupported", reason: `VFXR target "${targetId}" is not registered.` };
    try {
      return target.apply(channelId, value);
    } catch (error) {
      return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
    }
  }

  public clearPresentationAccentChannels(activeChannelIds: readonly string[]): void {
    const active = new Set(activeChannelIds);
    for (const target of this.targets.values()) {
      // Targets own their channel state; clear all known channel IDs that are no longer active.
      target.clearAllExcept?.(active);
    }
  }

  public update(deltaSeconds: number): void {
    for (const target of this.targets.values()) target.update?.(deltaSeconds);
  }

  public dispose(): void {
    for (const target of this.targets.values()) target.dispose?.();
    this.targets.clear();
  }
}

/** Camera-facing, subject-bound aura. Its intensity changes presentation only, never subject scale. */
export class VfxrSubjectAuraEffect implements PresentationEffectTarget {
  public readonly targetId = "vfxr.subject.aura-intensity";
  private readonly sprite: THREE.Sprite;
  private readonly material: THREE.SpriteMaterial;
  private readonly channels = new Map<string, number>();
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly subjectRoot: THREE.Object3D,
    private readonly camera: THREE.Camera,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create VFXR aura texture context.");
    const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, "rgba(125,211,252,0.0)");
    gradient.addColorStop(0.48, "rgba(56,189,248,0.24)");
    gradient.addColorStop(0.78, "rgba(139,92,246,0.13)");
    gradient.addColorStop(1, "rgba(139,92,246,0.0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.SpriteMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.renderOrder = 1;
    this.sprite.visible = false;
    this.scene.add(this.sprite);
  }

  public apply(channelId: string, value: number): PresentationAccentApplyResult {
    if (this.disposed) return { status: "failed", reason: "VFXR aura has been disposed." };
    if (!Number.isFinite(value) || value < 0) {
      return { status: "failed", reason: "Aura intensity must be a finite non-negative value." };
    }
    this.channels.set(channelId, value);
    const appliedOpacity = THREE.MathUtils.clamp(
      [...this.channels.values()].reduce((sum, current) => sum + current, 0),
      0,
      0.82,
    );
    this.material.opacity = appliedOpacity;
    this.sprite.visible = appliedOpacity > 0;
    return {
      status: "available",
      value: appliedOpacity,
      hostId: "vfxr-presentation-effects",
      provenance: "VFXR camera-facing subject aura sprite opacity",
    };
  }

  public clear(channelId: string): void {
    this.channels.delete(channelId);
    const appliedOpacity = THREE.MathUtils.clamp(
      [...this.channels.values()].reduce((sum, current) => sum + current, 0),
      0,
      0.82,
    );
    this.material.opacity = appliedOpacity;
    this.sprite.visible = appliedOpacity > 0;
  }

  public clearAllExcept(activeChannelIds: ReadonlySet<string>): void {
    for (const channelId of this.channels.keys()) {
      if (!activeChannelIds.has(channelId)) this.channels.delete(channelId);
    }
    const appliedOpacity = THREE.MathUtils.clamp(
      [...this.channels.values()].reduce((sum, current) => sum + current, 0),
      0,
      0.82,
    );
    this.material.opacity = appliedOpacity;
    this.sprite.visible = appliedOpacity > 0;
  }

  public update(_deltaSeconds: number): void {
    if (this.disposed || !this.sprite.visible) return;
    this.subjectRoot.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(this.subjectRoot);
    if (bounds.isEmpty()) {
      this.sprite.visible = false;
      return;
    }
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    this.sprite.position.copy(sphere.center);
    this.sprite.quaternion.copy(this.camera.quaternion);
    const diameter = Math.max(0.1, sphere.radius * 3.2);
    this.sprite.scale.set(diameter, diameter, 1);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.sprite);
    this.material.map?.dispose();
    this.material.dispose();
    this.channels.clear();
  }
}
