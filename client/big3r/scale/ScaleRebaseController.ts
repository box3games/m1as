import * as THREE from 'three';
import { LevelOrchestrator } from '../LevelOrchestrator.js';

export interface RebaseStateSnapshot {
  normalizedPlayerScale: number;
  activeTierWorldScale: number;
  prewarmedTierWorldScale: number;
  progress01: number;
  rebaseCount: number;
  effectiveMetricHeight: number;
}

export class ScaleRebaseController {
  private readonly orchestrator: LevelOrchestrator;
  private normalizedScale = 1.0;
  private rebaseCount = 0;
  private isRebasing = false;

  constructor(orchestrator: LevelOrchestrator) {
    this.orchestrator = orchestrator;
  }

  public getNormalizedScale(): number {
    return this.normalizedScale;
  }

  public getRebaseCount(): number {
    return this.rebaseCount;
  }

  public reset(): void {
    this.normalizedScale = 1.0;
    this.rebaseCount = 0;
    this.isRebasing = false;
  }

  /**
   * Advances normalized growth within [0.5, 2.0] by shrinking active tier ST_N (1.0 -> 0.5)
   * while scaling pre-warmed ST_N+1 (2.0 -> 1.0), snapping atomically at threshold.
   */
  public async update(
    rawGrowthRatio: number,
    playerRoot: THREE.Object3D
  ): Promise<RebaseStateSnapshot> {
    const manifest = this.orchestrator.getActiveManifest();
    const threshold = manifest?.rebasingThreshold ?? 2.0;
    const metricBase = manifest?.metricHeight ?? 1.6;

    // Clamp player mesh scale strictly within [0.5, 2.0] to prevent IEEE-754 jitter & shadow acne
    const clampedRatio = Math.max(0.5, rawGrowthRatio);
    const progress01 = Math.max(
      0,
      Math.min(1, (clampedRatio - 1.0) / Math.max(0.01, threshold - 1.0))
    );

    // Inverse tier shrink: ST_N scales from 1.0 -> 0.5 while ST_N+1 scales from 2.0 -> 1.0
    const activeTierScale = THREE.MathUtils.lerp(1.0, 0.5, progress01);
    const prewarmedTierScale = activeTierScale * 2.0;

    // Player visual scale stays anchored around [0.5, 2.0]
    this.normalizedScale = Math.min(2.0, Math.max(0.5, clampedRatio * activeTierScale));
    playerRoot.scale.setScalar(this.normalizedScale);

    const activeGroup = this.orchestrator.getActiveTierGroup();
    if (activeGroup) {
      activeGroup.scale.setScalar(activeTierScale);
    }

    const prewarmedGroup = this.orchestrator.getPrewarmedTierGroup();
    if (prewarmedGroup) {
      prewarmedGroup.scale.setScalar(prewarmedTierScale);
    }

    // Trigger atomic tier handoff when ST_N reaches 0.5x and a next tier exists
    if (
      activeTierScale <= 0.502 &&
      manifest?.nextTierId &&
      !this.isRebasing
    ) {
      this.isRebasing = true;
      try {
        await this.orchestrator.activateTier(manifest.nextTierId);
        this.rebaseCount += 1;
        this.normalizedScale = 1.0;
        playerRoot.scale.setScalar(1.0);
      } finally {
        this.isRebasing = false;
      }
    }

    const updatedManifest = this.orchestrator.getActiveManifest();
    const effectiveMetricHeight =
      (updatedManifest?.metricHeight ?? metricBase) * this.normalizedScale;

    return {
      normalizedPlayerScale: Number(this.normalizedScale.toFixed(3)),
      activeTierWorldScale: Number(activeTierScale.toFixed(3)),
      prewarmedTierWorldScale: Number(prewarmedTierScale.toFixed(3)),
      progress01: Number(progress01.toFixed(3)),
      rebaseCount: this.rebaseCount,
      effectiveMetricHeight: Number(effectiveMetricHeight.toFixed(2)),
    };
  }
}
