import * as THREE from 'three';
import {
  resolveM1ASTexture,
  type ManagedTextureHandle,
} from '../textures/ResolveM1ASTexture.js';

interface CachedAssetEntry {
  key: string;
  tierId: string;
  handle: ManagedTextureHandle;
  isVideo: boolean;
  videoEl: HTMLVideoElement | null;
  lastUsedMs: number;
}

export class AssetEngine {
  private readonly userId: string;
  private readonly maxVideoDecoders: number;
  private readonly entries = new Map<string, CachedAssetEntry>();

  constructor(userId = 'dev-user', maxVideoDecoders = 4) {
    this.userId = userId;
    this.maxVideoDecoders = Math.max(1, maxVideoDecoders);
  }

  public getActiveVideoDecoderCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.isVideo) count++;
    }
    return count;
  }

  public getActiveTextureCount(): number {
    return this.entries.size;
  }

  /**
   * Resolves an M1AS asset via @m1as/client-textures while enforcing the
   * hardware <video> decoder cap via LRU eviction.
   */
  public async acquireSlotTexture(
    tierId: string,
    slotId: string,
    url: string,
    mimeType: string,
    label?: string
  ): Promise<THREE.Texture> {
    const key = `${tierId}:${slotId}`;
    const existing = this.entries.get(key);
    if (existing) {
      existing.lastUsedMs = performance.now();
      return existing.handle.texture;
    }

    const isVideo =
      mimeType.toLowerCase().startsWith('video/') ||
      url.toLowerCase().endsWith('.webm') ||
      url.toLowerCase().endsWith('.mp4');

    if (isVideo) {
      this.evictOldestVideoIfAtCap();
    }

    const handle = await resolveM1ASTexture(url, mimeType, {
      userId: this.userId,
      label,
      flipY: false,
    });

    const videoEl =
      handle.texture instanceof THREE.VideoTexture
        ? (handle.texture.image as HTMLVideoElement)
        : null;

    this.entries.set(key, {
      key,
      tierId,
      handle,
      isVideo: videoEl !== null,
      videoEl,
      lastUsedMs: performance.now(),
    });

    return handle.texture;
  }

  /**
   * Pauses or resumes a portal/slot <video> element based on 2D frustum visibility.
   */
  public setSlotPlaybackVisible(tierId: string, slotId: string, visible: boolean): void {
    const entry = this.entries.get(`${tierId}:${slotId}`);
    if (!entry?.videoEl) return;

    if (visible) {
      entry.lastUsedMs = performance.now();
      if (entry.videoEl.paused) {
        entry.videoEl.play().catch(() => {});
      }
    } else if (!entry.videoEl.paused) {
      entry.videoEl.pause();
    }
  }

  /**
   * Releases and disposes all textures and <video>/<audio> elements owned by a tier.
   */
  public releaseTier(tierId: string): void {
    for (const [key, entry] of Array.from(this.entries.entries())) {
      if (entry.tierId === tierId) {
        entry.handle.dispose();
        this.entries.delete(key);
      }
    }
  }

  private evictOldestVideoIfAtCap(): void {
    while (this.getActiveVideoDecoderCount() >= this.maxVideoDecoders) {
      let oldest: CachedAssetEntry | null = null;
      for (const entry of this.entries.values()) {
        if (!entry.isVideo) continue;
        if (!oldest || entry.lastUsedMs < oldest.lastUsedMs) {
          oldest = entry;
        }
      }
      if (!oldest) break;
      oldest.handle.dispose();
      this.entries.delete(oldest.key);
    }
  }

  public destroy(): void {
    for (const entry of this.entries.values()) {
      entry.handle.dispose();
    }
    this.entries.clear();
  }
}
