export type PsychologicalPhaseId =
  | 'DormantGrind'
  | 'Curiosity'
  | 'Panic'
  | 'Rampage';

export interface GrowthCurvePhaseConfig {
  id: PsychologicalPhaseId;
  minScale: number;
  maxScale: number;
  fovRange: [number, number];
  eyeCreepMultiplier: number;
  windowParallaxStrength: number;
  cameraShakeIntensity: number;
  cameraTiltRad: number;
  triggerSeamDustVfx: boolean;
  triggerFracturedWallsVfx: boolean;
  triggerStepShockwaves: boolean;
  allowPropKick: boolean;
  forceCrouchDoors: boolean;
}

export interface Big3rGrowthCurveConfig {
  version: string;
  phases: GrowthCurvePhaseConfig[];
}

export interface GrowthCurveFrameOutput {
  phase: PsychologicalPhaseId;
  phaseProgress01: number;
  targetFov: number;
  eyeCreepOffsetY: number;
  windowParallaxStrength: number;
  cameraShakeIntensity: number;
  cameraTiltRad: number;
  triggerSeamDustVfx: boolean;
  triggerFracturedWallsVfx: boolean;
  triggerStepShockwaves: boolean;
  allowPropKick: boolean;
  forceCrouchDoors: boolean;
  shouldRebase: boolean;
}

export const DEFAULT_BIG3R_GROWTH_CURVE: Big3rGrowthCurveConfig = {
  version: '1.0.0',
  phases: [
    {
      id: 'DormantGrind',
      minScale: 1.0,
      maxScale: 1.08,
      fovRange: [60, 60],
      eyeCreepMultiplier: 0.04,
      windowParallaxStrength: 0.0,
      cameraShakeIntensity: 0.0,
      cameraTiltRad: 0.0,
      triggerSeamDustVfx: false,
      triggerFracturedWallsVfx: false,
      triggerStepShockwaves: false,
      allowPropKick: false,
      forceCrouchDoors: false,
    },
    {
      id: 'Curiosity',
      minScale: 1.08,
      maxScale: 1.35,
      fovRange: [60, 68],
      eyeCreepMultiplier: 0.12,
      windowParallaxStrength: 0.35,
      cameraShakeIntensity: 0.005,
      cameraTiltRad: 0.015,
      triggerSeamDustVfx: false,
      triggerFracturedWallsVfx: false,
      triggerStepShockwaves: false,
      allowPropKick: true,
      forceCrouchDoors: false,
    },
    {
      id: 'Panic',
      minScale: 1.35,
      maxScale: 1.85,
      fovRange: [68, 86],
      eyeCreepMultiplier: 0.25,
      windowParallaxStrength: 0.75,
      cameraShakeIntensity: 0.032,
      cameraTiltRad: 0.055,
      triggerSeamDustVfx: true,
      triggerFracturedWallsVfx: false,
      triggerStepShockwaves: false,
      allowPropKick: true,
      forceCrouchDoors: true,
    },
    {
      id: 'Rampage',
      minScale: 1.85,
      maxScale: 2.0,
      fovRange: [86, 95],
      eyeCreepMultiplier: 0.4,
      windowParallaxStrength: 1.0,
      cameraShakeIntensity: 0.065,
      cameraTiltRad: 0.09,
      triggerSeamDustVfx: true,
      triggerFracturedWallsVfx: true,
      triggerStepShockwaves: true,
      allowPropKick: true,
      forceCrouchDoors: true,
    },
  ],
};

export class GrowthCurveStateMachine {
  private config: Big3rGrowthCurveConfig;
  private currentPhase: PsychologicalPhaseId = 'DormantGrind';

  constructor(config: Big3rGrowthCurveConfig = DEFAULT_BIG3R_GROWTH_CURVE) {
    this.config = config;
  }

  public loadConfig(config: Big3rGrowthCurveConfig): void {
    this.config = config;
  }

  public getCurrentPhase(): PsychologicalPhaseId {
    return this.currentPhase;
  }

  public evaluate(normalizedScale: number): GrowthCurveFrameOutput {
    const s = Math.max(1.0, Math.min(2.0, normalizedScale));
    const phases = this.config.phases;
    const active =
      phases.find((p) => s >= p.minScale && s < p.maxScale) ??
      phases[phases.length - 1];

    this.currentPhase = active.id;
    const span = Math.max(0.001, active.maxScale - active.minScale);
    const t = Math.max(0, Math.min(1, (s - active.minScale) / span));

    const targetFov = active.fovRange[0] + (active.fovRange[1] - active.fovRange[0]) * t;

    return {
      phase: active.id,
      phaseProgress01: Number(t.toFixed(3)),
      targetFov: Number(targetFov.toFixed(2)),
      eyeCreepOffsetY: active.eyeCreepMultiplier * t,
      windowParallaxStrength: active.windowParallaxStrength * (0.4 + 0.6 * t),
      cameraShakeIntensity: active.cameraShakeIntensity * (0.5 + 0.5 * t),
      cameraTiltRad: active.cameraTiltRad * Math.sin(t * Math.PI * 0.5),
      triggerSeamDustVfx: active.triggerSeamDustVfx,
      triggerFracturedWallsVfx: active.triggerFracturedWallsVfx,
      triggerStepShockwaves: active.triggerStepShockwaves,
      allowPropKick: active.allowPropKick,
      forceCrouchDoors: active.forceCrouchDoors,
      shouldRebase: s >= 1.995,
    };
  }
}
