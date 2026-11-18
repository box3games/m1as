import type * as THREE from 'three';
import type { OrchestratorTelemetry } from '../LevelOrchestrator.js';
import type { RebaseStateSnapshot } from '../scale/ScaleRebaseController.js';
import type { PsychologicalPhaseId } from '../scale/GrowthCurveStateMachine.js';
import type { CameraRigMode } from '../camera/CameraRig5Mode.js';

export class TelemetryHud {
  private readonly container: HTMLElement;
  private frames = 0;
  private lastFpsSample = performance.now();
  private fps = 60;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public tick(
    renderer: THREE.WebGLRenderer,
    orchestrator: OrchestratorTelemetry,
    rebase: RebaseStateSnapshot,
    phase: PsychologicalPhaseId,
    camMode: CameraRigMode
  ): void {
    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsSample >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.lastFpsSample));
      this.frames = 0;
      this.lastFpsSample = now;
    }

    const drawCalls = renderer.info.render.calls;
    const geometries = renderer.info.memory.geometries;
    const textures = renderer.info.memory.textures;

    this.container.innerHTML = [
      `<strong>FPS:</strong> ${this.fps}`,
      `<strong>DrawCalls:</strong> ${drawCalls}`,
      `<strong>Decoders:</strong> ${orchestrator.activeVideoDecoders}`,
      `<strong>VRAM Geo/Tex:</strong> ${geometries}/${textures}`,
      `<strong>Tier:</strong> ${orchestrator.activeTierName} (${rebase.effectiveMetricHeight}m)`,
      `<strong>NormScale:</strong> ${rebase.normalizedPlayerScale.toFixed(2)}x [Rebases: ${rebase.rebaseCount}]`,
      `<strong>Phase:</strong> ${phase}`,
      `<strong>Cam:</strong> M${camMode}`,
      `<strong>Compute:</strong> ZSC ($0 Server)`,
    ].join(' &nbsp;|&nbsp; ');
  }
}
