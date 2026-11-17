import * as THREE from 'three';
import {
  M1ASFaceSurfaceResolver,
  type FaceAssetType,
} from '../M1ASFaceSurfaceResolver.js';

export interface ManagedTextureHandle {
  texture: THREE.Texture;
  mimeType: string;
  slotKey: string;
  dispose: () => void;
}

export interface ResolveTextureOptions {
  userId?: string;
  label?: string;
  flipY?: boolean;
  resolver?: M1ASFaceSurfaceResolver;
}

let sharedResolver: M1ASFaceSurfaceResolver | null = null;
let handleCounter = 0;

function getResolver(userId = 'dev-user'): M1ASFaceSurfaceResolver {
  if (!sharedResolver) {
    sharedResolver = new M1ASFaceSurfaceResolver(userId);
  }
  return sharedResolver;
}

function mapMimeToFaceAssetType(mime: string, url: string): FaceAssetType {
  const normalizedMime = mime.toLowerCase().trim();
  const normalizedUrl = url.toLowerCase();

  if (normalizedMime.includes('svg') || normalizedUrl.endsWith('.svg')) {
    return 'svg-preview';
  }
  if (
    normalizedMime.includes('json') ||
    normalizedMime.startsWith('text/') ||
    normalizedUrl.endsWith('.json')
  ) {
    return 'text';
  }
  if (
    normalizedMime.startsWith('video/') ||
    normalizedUrl.endsWith('.webm') ||
    normalizedUrl.endsWith('.mp4')
  ) {
    return 'video';
  }
  if (
    normalizedMime.startsWith('audio/') ||
    normalizedUrl.endsWith('.mp3') ||
    normalizedUrl.endsWith('.wav')
  ) {
    return 'audio';
  }
  if (normalizedMime.includes('pdf') || normalizedUrl.endsWith('.pdf')) {
    return 'pdf-snapshot';
  }
  if (
    normalizedMime.includes('gltf') ||
    normalizedUrl.endsWith('.glb') ||
    normalizedUrl.endsWith('.gltf')
  ) {
    return 'glb-snapshot';
  }
  return 'image';
}

/**
 * Resolves a signed M1AS asset URL + MIME type into a Three.js Texture
 * with deterministic VRAM + HTMLMediaElement disposal.
 */
export async function resolveM1ASTexture(
  url: string,
  mime: string,
  options: ResolveTextureOptions = {}
): Promise<ManagedTextureHandle> {
  const resolver = options.resolver ?? getResolver(options.userId);
  const slotKey = `m1as_tex_${++handleCounter}_${Date.now()}`;
  const assetType = mapMimeToFaceAssetType(mime, url);

  // Use a temporary material host so M1ASFaceSurfaceResolver binds & tracks the slot
  const tempMat = new THREE.MeshStandardMaterial();
  await resolver.applyToMaterial(slotKey, tempMat, assetType, url, options.label);

  const texture = tempMat.map;
  // Detach from tempMat before disposing tempMat so the resolved texture stays alive
  tempMat.map = null;
  tempMat.dispose();

  if (!texture) {
    resolver.cleanupSlot(slotKey);
    throw new Error(`Failed to resolve texture for MIME "${mime}" at ${url}`);
  }

  if (typeof options.flipY === 'boolean') {
    texture.flipY = options.flipY;
    texture.needsUpdate = true;
  }

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    texture.dispose();
    resolver.cleanupSlot(slotKey);
  };

  return {
    texture,
    mimeType: mime,
    slotKey,
    dispose,
  };
}

export function disposeSharedTextureResolver(): void {
  if (sharedResolver) {
    sharedResolver.destroy();
    sharedResolver = null;
  }
}
