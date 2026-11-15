import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type GrowthTriggerMode = 'click' | 'tap' | 'hold' | 'chaos-delayed';

export interface GrowthStateSnapshot {
  currentScale: number;
  targetScale: number;
  chaosCharge: number;
  isChaosPending: boolean;
  isHolding: boolean;
  mode: GrowthTriggerMode;
}

export interface M1ASVFXEngineOptions {
  userId?: string;
  moveSpeed?: number;
  baseScale?: number;
  maxScale?: number;
  chaosProbability?: number; // 0.0 to 1.0 chance on trigger to enter delayed colossal state
  onStateChange?: (state: GrowthStateSnapshot) => void;
  onColossalSurge?: (newScale: number) => void;
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
  private frameId: number | null = null;

  // Target .glb & grounding metrics
  private subjectRoot: THREE.Group = new THREE.Group();
  private loadedModel: THREE.Object3D | null = null;
  private baseModelHeight = 1;

  // Organic Fractal Scale & Bulge State
  private currentScale = 1.0;
  private targetScale = 1.0;
  private scaleVelocity = 0;
  private readonly minScale = 0.4;
  private readonly maxScale: number;

  private pulsePhase = 0;
  private pulseAmplitude = 0;
  private bulgePhase = 0;
  private bulgeIntensity = 0;

  // Input & Chaos State
  private mode: GrowthTriggerMode = 'click';
  private isHolding = false;
  private holdDuration = 0;
  private chaosProbability: number;
  private isChaosPending = false;
  private chaosTimer = 0;
  private chaosStoredImpulse = 0;

  // WASD / Directional Movement
  private keysPressed = new Set<string>();
  private moveSpeed: number;
  private raycaster = new THREE.Raycaster();
  private pointerDownPos = new THREE.Vector2();

  // Optional .webm VFX overlay
  private vfxBlobUrl: string | null = null;
  private activeVfxPlanes: Array<{ mesh: THREE.Mesh; video: HTMLVideoElement; texture: THREE.VideoTexture }> = [];

  private onStateChange?: (state: GrowthStateSnapshot) => void;
  private onColossalSurge?: (newScale: number) => void;

  constructor(canvas: HTMLCanvasElement, glbBlobUrl: string, options: M1ASVFXEngineOptions = {}) {
    this.canvas = canvas;
    this.glbBlobUrl = glbBlobUrl;
    this.userId = options.userId ?? 'dev-user';
    this.moveSpeed = options.moveSpeed ?? 3.5;
    this.currentScale = options.baseScale ?? 1.0;
    this.targetScale = this.currentScale;
    this.maxScale = options.maxScale ?? 8.0;
    this.chaosProbability = options.chaosProbability ?? 0.35;
    this.onStateChange = options.onStateChange;
    this.onColossalSurge = options.onColossalSurge;

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
    this.scene.background = new THREE.Color(0x0f172a);

    // Spatial reference grid so scale & WASD movement feel grounded
    const grid = new THREE.GridHelper(24, 24, 0x38bdf8, 0x1e293b);
    this.scene.add(grid);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 150);
    this.camera.position.set(0, 3.2, 6.5);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.8, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.25);
    dirLight.position.set(6, 12, 8);
    this.scene.add(dirLight);

    this.scene.add(this.subjectRoot);
    this.loadGlb();

    // Bind Listeners
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

        // Normalize model so its bottom rests cleanly at y = 0 inside subjectRoot
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
        this.subjectRoot.add(this.loadedModel);
        this.emitState();
      },
      undefined,
      (err) => console.error('[M1ASVFXEngine] Failed to load .glb:', err)
    );
  }

  // =========================================================================
  // PUBLIC GROWTH & CHAOS API (Wire to UI Buttons, Keys, or Clicks)
  // =========================================================================

  public setMode(mode: GrowthTriggerMode): void {
    this.mode = mode;
    this.isHolding = false;
    this.holdDuration = 0;
    this.emitState();
  }

  public resetGrowth(): void {
    this.currentScale = 1.0;
    this.targetScale = 1.0;
    this.scaleVelocity = 0;
    this.pulseAmplitude = 0;
    this.bulgeIntensity = 0;
    this.isChaosPending = false;
    this.chaosStoredImpulse = 0;
    this.subjectRoot.position.set(0, 0, 0);
    this.subjectRoot.scale.set(1, 1, 1);
    this.emitState();
  }

  /** Discrete growth impulse (used by Click or Tap-to-Grow button) */
  public triggerGrowthImpulse(amount = 0.35): void {
    if (this.mode === 'chaos-delayed' || (!this.isChaosPending && Math.random() < this.chaosProbability && this.mode !== 'click')) {
      this.queueChaosDelay(amount);
      return;
    }

    this.targetScale = Math.min(this.maxScale, this.targetScale + amount);
    this.pulseAmplitude = Math.min(0.22, this.pulseAmplitude + 0.08);
    this.bulgeIntensity = Math.min(0.28, this.bulgeIntensity + 0.14);
    this.spawnVfxOverlay();
    this.emitState();
  }

  /** Start holding growth trigger (longer hold = larger surge) */
  public startHoldGrowth(): void {
    this.isHolding = true;
    this.holdDuration = 0;
    this.emitState();
  }

  /** Release hold growth trigger */
  public releaseHoldGrowth(): void {
    if (!this.isHolding) return;
    this.isHolding = false;

    const chargeBonus = Math.min(2.5, this.holdDuration * 1.15);
    this.holdDuration = 0;

    if (this.mode === 'chaos-delayed') {
      this.queueChaosDelay(0.4 + chargeBonus);
    } else {
      this.triggerGrowthImpulse(0.25 + chargeBonus);
    }
    this.emitState();
  }

  /** Forces an immediate delayed colossal growth event for testing */
  public triggerDelayedColossalChaos(delaySeconds = 1.8, colossalMultiplier = 2.4): void {
    this.isChaosPending = true;
    this.chaosTimer = delaySeconds;
    this.chaosStoredImpulse = colossalMultiplier;
    this.emitState();
  }

  private queueChaosDelay(impulse: number): void {
    if (!this.isChaosPending) {
      this.isChaosPending = true;
      // Random eerie pause between 1.2s and 2.6s where growth appears frozen
      this.chaosTimer = 1.2 + Math.random() * 1.4;
      this.chaosStoredImpulse = impulse * 2.6; // Amplified colossal payoff
    } else {
      // Stacking more triggers during the stall makes the eventual eruption even bigger
      this.chaosStoredImpulse += impulse * 2.2;
    }
    this.emitState();
  }

  // =========================================================================
  // ORGANIC FRACTAL SCALING & BULGE SOLVER
  // =========================================================================

  /**
   * Computes a multi-octave fractal pulse wave (mimicking mushroom cellular turgor)
   * layered over a damped spring toward targetScale.
   */
  private updateOrganicScale(dt: number): void {
    // 1. Handle Hold-to-Grow accumulation
    if (this.isHolding) {
      this.holdDuration += dt;
      // Subtle pre-expansion tremor while charging
      this.bulgeIntensity = Math.min(0.2, 0.05 + this.holdDuration * 0.08);
    }

    // 2. Handle Delayed Chaos Countdown ("false stall" -> colossal eruption)
    if (this.isChaosPending) {
      this.chaosTimer -= dt;
      if (this.chaosTimer <= 0) {
        this.isChaosPending = false;
        this.targetScale = Math.min(this.maxScale, this.targetScale + this.chaosStoredImpulse);
        this.chaosStoredImpulse = 0;
        this.pulseAmplitude = 0.26;
        this.bulgeIntensity = 0.35;
        this.spawnVfxOverlay();
        this.onColossalSurge?.(this.targetScale);
        this.emitState();
      }
    }

    // 3. Damped spring physics from currentScale -> targetScale
    const stiffness = 18.0;
    const damping = 5.2;
    const force = (this.targetScale - this.currentScale) * stiffness;
    this.scaleVelocity = (this.scaleVelocity + force * dt) * Math.exp(-damping * dt);
    this.currentScale += this.scaleVelocity * dt;

    // 4. Fractal harmonic octaves (f1 + 0.5*f2 + 0.25*f3) for organic pulsing
    this.pulsePhase += dt * 9.5;
this.bulgePhase += dt * 12.0;
const fractalWave =
Math.sin(this.pulsePhase) * 0.57 +
Math.sin(this.pulsePhase * 2.13) * 0.29 +
Math.sin(this.pulsePhase * 4.07) * 0.14;
// Micro-tremor when chaos is stalled/pending
const chaosTremor = this.isChaosPending ? Math.sin(this.pulsePhase * 3.5) * 0.035 : 0;
const pulseOffset = fractalWave * this.pulseAmplitude + chaosTremor;
const effectiveScale = Math.max(this.minScale, this.currentScale + pulseOffset);
// 5. Anisotropic Bulge (XZ widens out of phase with Y stretch, preserving organic feel)
const bulgeWave = Math.sin(this.bulgePhase) * this.bulgeIntensity;
const scaleX = effectiveScale * (1 + bulgeWave);
const scaleY = effectiveScale * (1 - bulgeWave * 0.65);
const scaleZ = effectiveScale * (1 + bulgeWave);
this.subjectRoot.scale.set(scaleX, scaleY, scaleZ);
// Decay pulse & bulge energy smoothly
this.pulseAmplitude *= Math.exp(-3.2 * dt);
this.bulgeIntensity *= Math.exp(-3.8 * dt);
}
// =========================================================================
// WASD / ARROW MOVEMENT & RAYCAST CLICKING
// =========================================================================
private updateMovement(dt: number): void {
let moveX = 0;
let moveZ = 0;
if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) moveZ -= 1;
if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) moveZ += 1;
if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) moveX -= 1;
if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) moveX += 1;
if (moveX !== 0 || moveZ !== 0) {
const len = Math.hypot(moveX, moveZ);
this.subjectRoot.position.x += (moveX / len) * this.moveSpeed * dt;
this.subjectRoot.position.z += (moveZ / len) * this.moveSpeed * dt;
// Subtle organic locomotion bob scaled to character size
this.bulgeIntensity = Math.max(this.bulgeIntensity, 0.04);
}
}
private onKeyDown(e: KeyboardEvent): void {
// Ignore typing in text inputs
if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
this.keysPressed.add(e.code);
if (e.code === 'Space' && !e.repeat) {
e.preventDefault();
if (this.mode === 'hold') {
this.startHoldGrowth();
} else {
this.triggerGrowthImpulse(0.35);
}
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
const hits = this.raycaster.intersectObject(this.loadedModel, true);
if (hits.length > 0) {
this.triggerGrowthImpulse(0.35);
}
}
// =========================================================================
// TRANSPARENT .WEBM VFX OVERLAYS
// =========================================================================
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
private spawnVfxOverlay(): void {
if (!this.vfxBlobUrl) return;
const video = document.createElement('video');
video.src = this.vfxBlobUrl;
video.muted = true;
video.loop = false;
video.playsInline = true;
const texture = new THREE.VideoTexture(video);
texture.colorSpace = THREE.SRGBColorSpace;
const size = Math.max(1.8, this.currentScale * 1.6);
const geo = new THREE.PlaneGeometry(size, size);
const mat = new THREE.MeshBasicMaterial({
map: texture,
transparent: true,
depthWrite: false,
side: THREE.DoubleSide,
});
const plane = new THREE.Mesh(geo, mat);
plane.position.copy(this.subjectRoot.position);
plane.position.y += (this.baseModelHeight * this.currentScale) * 0.5;
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
private emitState(): void {
this.onStateChange?.({
currentScale: Number(this.currentScale.toFixed(2)),
targetScale: Number(this.targetScale.toFixed(2)),
chaosCharge: Number(this.chaosStoredImpulse.toFixed(2)),
isChaosPending: this.isChaosPending,
isHolding: this.isHolding,
mode: this.mode,
});
}
private animate(): void {
this.frameId = requestAnimationFrame(this.animate);
const dt = Math.min(this.clock.getDelta(), 0.05);
this.updateMovement(dt);
this.updateOrganicScale(dt);
for (const vfx of this.activeVfxPlanes) {
vfx.mesh.quaternion.copy(this.camera.quaternion);
}
this.controls.update();
this.renderer.render(this.scene, this.camera);
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