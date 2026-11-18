import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GrowthCurveFrameOutput } from '../scale/GrowthCurveStateMachine.js';

export type CameraRigMode = 1 | 2 | 3 | 4 | 5;

export class CameraRig5Mode {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private mode: CameraRigMode = 1;
  private heightReticleEl: HTMLElement | null = null;

  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera;
    this.controls = controls;
  }

  public attachHeightReticle(el: HTMLElement): void {
    this.heightReticleEl = el;
    this.syncReticleVisibility();
  }

  public setMode(mode: CameraRigMode): void {
    this.mode = mode;
    this.controls.enabled = mode === 1 || mode === 5;
    this.syncReticleVisibility();
  }

  public getMode(): CameraRigMode {
    return this.mode;
  }

  private syncReticleVisibility(): void {
    if (!this.heightReticleEl) return;
    this.heightReticleEl.style.display = this.mode === 1 ? 'flex' : 'none';
  }

  public update(
    dt: number,
    playerRoot: THREE.Object3D,
    normalizedScale: number,
    curve: GrowthCurveFrameOutput,
    tvPosition?: THREE.Vector3
  ): void {
    // Dynamic near-clip prevents near-plane clipping & z-fighting across scale transitions
    const dynamicNear = THREE.MathUtils.clamp(normalizedScale * 0.045, 0.01, 0.45);
    if (Math.abs(this.camera.near - dynamicNear) > 0.002) {
      this.camera.near = dynamicNear;
    }

    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, curve.targetFov, dt * 6);
    this.camera.updateProjectionMatrix();

    const p = playerRoot.position;
    const eyeY = normalizedScale * 1.15 + curve.eyeCreepOffsetY;

    switch (this.mode) {
      case 1: // FreeExplore + HeightReticle
        this.controls.target.lerp(new THREE.Vector3(p.x, eyeY * 0.65, p.z), dt * 6);
        break;

      case 2: // Obs1 (Over-the-shoulder / low-angle scale observer)
        this.camera.position.lerp(
          new THREE.Vector3(p.x + 2.2 * normalizedScale, eyeY * 0.55, p.z + 3.4 * normalizedScale),
          dt * 5
        );
        this.camera.lookAt(p.x, eyeY * 0.85, p.z);
        break;

      case 3: { // Obs2 (4-Face Emissive TV & diorama inspection angle)
        const focus = tvPosition ?? new THREE.Vector3(p.x, eyeY * 0.7, p.z);
        this.camera.position.lerp(
          new THREE.Vector3(focus.x, focus.y + 0.65, focus.z + 2.6),
          dt * 6
        );
        this.camera.lookAt(focus);
        break;
      }

      case 4: { // FirstPerson (Eye-level inside character with psychological tilt & shake)
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerRoot.quaternion);
        this.camera.position.set(p.x, eyeY, p.z);
        const lookTarget = this.camera.position.clone().add(forward.multiplyScalar(4));
        this.camera.lookAt(lookTarget);
        this.camera.rotation.z = curve.cameraTiltRad * Math.sin(performance.now() * 0.004);
        break;
      }

      case 5: // Worms / BirdsEye + DynamicNearClip
        this.camera.position.lerp(
          new THREE.Vector3(p.x, Math.max(0.18, normalizedScale * 4.8), p.z + 0.8),
          dt * 4.5
        );
        this.camera.lookAt(p.x, 0.1, p.z);
        break;
    }

    // Apply micro-shake in Panic / Rampage phases
    if (curve.cameraShakeIntensity > 0) {
      this.camera.position.x += (Math.random() - 0.5) * curve.cameraShakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * curve.cameraShakeIntensity;
    }
  }
}
