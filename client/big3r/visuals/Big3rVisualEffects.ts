import * as THREE from 'three';

const SCREEN_BOX_MAT_INDICES: readonly [number, number, number, number] = [4, 0, 5, 1];

export interface WindowParallaxUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uMap: THREE.IUniform<THREE.Texture | null>;
  uCameraOffset: THREE.IUniform<THREE.Vector2>;
  uScaleZoom: THREE.IUniform<number>;
  uParallaxDepth: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
}

/**
 * Custom ShaderMaterial for m1as_window_pane and parallax depth walls
 * (e.g. books/lab_shelves.webm), binding UV_Y/zoom/scrub to player scale (1x -> 4x).
 */
export function createWindowParallaxMaterial(
  texture: THREE.Texture | null,
  parallaxDepth = 0.14
): THREE.ShaderMaterial {
  const uniforms: WindowParallaxUniforms = {
    uMap: { value: texture },
    uCameraOffset: { value: new THREE.Vector2(0, 0) },
    uScaleZoom: { value: 1.0 },
    uParallaxDepth: { value: parallaxDepth },
    uOpacity: { value: 1.0 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec2 uCameraOffset;
      uniform float uScaleZoom;
      uniform float uParallaxDepth;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        // Scale zoom & vertical scrub driven by 1x -> 4x scale mapping
        float zoom = clamp(uScaleZoom, 1.0, 4.0);
        vec2 centered = (vUv - 0.5) / zoom + 0.5;
        vec2 parallaxUv = centered + uCameraOffset * uParallaxDepth;
        parallaxUv = clamp(parallaxUv, vec2(0.002), vec2(0.998));

        vec4 texel = texture2D(uMap, parallaxUv);
        gl_FragColor = vec4(texel.rgb, texel.a * uOpacity);
      }
    `,
  });
}

export function updateWindowParallaxUniforms(
  material: THREE.ShaderMaterial,
  camera: THREE.Camera,
  surfaceWorldPos: THREE.Vector3,
  scale1xTo4x: number
): void {
  const u = material.uniforms as WindowParallaxUniforms;
  const dx = THREE.MathUtils.clamp((camera.position.x - surfaceWorldPos.x) * 0.08, -0.35, 0.35);
  const dy = THREE.MathUtils.clamp((camera.position.y - surfaceWorldPos.y) * 0.08, -0.35, 0.35);
  u.uCameraOffset.value.set(dx, dy);
  u.uScaleZoom.value = THREE.MathUtils.clamp(scale1xTo4x, 1.0, 4.0);
}

/**
 * Rotates prop billboards (e.g. fishbowl.webm) strictly around Y-up so they face
 * the camera horizontally without tilting vertically.
 */
export function updateYLockedBillboards(
  billboards: THREE.Object3D[],
  camera: THREE.Camera
): void {
  const camPos = camera.position;
  for (const obj of billboards) {
    const dx = camPos.x - obj.position.x;
    const dz = camPos.z - obj.position.z;
    obj.rotation.set(0, Math.atan2(dx, dz), 0);
  }
}

/**
 * 4-Face Emissive TV Prop:
 * Clicking in Obs2 mode rotates 90deg around Y, plays the active face's .webm,
 * and pauses the 3 hidden face <video> elements to enforce flat sawtooth VRAM/CPU.
 */
export class EmissiveFourFaceTvProp {
  public readonly root = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly videos: Array<HTMLVideoElement | null> = [null, null, null, null];
  private readonly textures: Array<THREE.VideoTexture | null> = [null, null, null, null];
  private activeFace = 0;
  private targetYaw = 0;

  constructor(size = 1.1) {
    const geo = new THREE.BoxGeometry(size, size * 0.72, size);
    // BoxGeometry material order: 0:+X, 1:-X, 2:+Y(top), 3:-Y(bottom), 4:+Z, 5:-Z
    const sideIndices = SCREEN_BOX_MAT_INDICES;

    for (let i = 0; i < 6; i++) {
      const isScreen = sideIndices.includes(i);
      this.materials.push(
        new THREE.MeshStandardMaterial({
          color: isScreen ? 0xffffff : 0x0f172a,
          emissive: isScreen ? new THREE.Color(0x38bdf8) : new THREE.Color(0x000000),
          emissiveIntensity: isScreen ? 0.85 : 0.0,
          roughness: 0.35,
        })
      );
    }

    this.mesh = new THREE.Mesh(geo, this.materials);
    this.mesh.position.y = size * 0.36;
    this.root.add(this.mesh);
  }

  public bindScreenVideo(screenIndex: 0 | 1 | 2 | 3, webmUrl: string): void {
    const boxMatIdx = SCREEN_BOX_MAT_INDICES [screenIndex];
    this.disposeScreen(screenIndex);

    const video = document.createElement('video');
    video.src = webmUrl;
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.muted = true;
    video.playsInline = true;

    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;

    const mat = this.materials[boxMatIdx];
    mat.map = tex;
    mat.emissiveMap = tex;
    mat.emissive.setHex(0xffffff);
    mat.emissiveIntensity = 1.1;
    mat.needsUpdate = true;

    this.videos[screenIndex] = video;
    this.textures[screenIndex] = tex;
    this.syncDecoderPlayback();
  }

  /**
   * Called on RaycastClick in Obs2 camera mode: rotates 90 degrees on Y and swaps active decoder.
   */
  public rotateNextFace(): number {
    this.activeFace = (this.activeFace + 1) % 4;
    this.targetYaw += Math.PI * 0.5;
    this.syncDecoderPlayback();
    return this.activeFace;
  }

  public update(dt: number): void {
    this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, this.targetYaw, dt * 10);
  }

  private syncDecoderPlayback(): void {
    for (let i = 0; i < 4; i++) {
      const vid = this.videos[i];
      if (!vid) continue;
      if (i === this.activeFace) {
        if (vid.paused) vid.play().catch(() => {});
      } else if (!vid.paused) {
        vid.pause();
      }
    }
  }

  private disposeScreen(screenIndex: 0 | 1 | 2 | 3): void {
    const boxMatIdx = SCREEN_BOX_MAT_INDICES [screenIndex];
    const mat = this.materials[boxMatIdx];
    mat.map = null;
    mat.emissiveMap = null;

    this.textures[screenIndex]?.dispose();
    this.textures[screenIndex] = null;

    const vid = this.videos[screenIndex];
    if (vid) {
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      this.videos[screenIndex] = null;
    }
  }

  public destroy(): void {
    for (let i = 0; i < 4; i++) {
      this.disposeScreen(i as 0 | 1 | 2 | 3);
    }
    this.mesh.geometry.dispose();
    this.materials.forEach((m) => m.dispose());
    this.root.clear();
  }
}
