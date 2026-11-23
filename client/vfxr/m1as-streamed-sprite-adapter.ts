import * as THREE from "three";
import type { M1asAsset } from "../viewer/types.js";
import { resolveM1ASTexture, type ManagedTextureHandle } from "../textures/ResolveM1ASTexture.js";
import { M1ASFaceSurfaceResolver } from "../M1ASFaceSurfaceResolver.js";
import { TwoDimensionalSpriteGrowthModel } from "../growth/two-dimensional-sprite-growth-model.js";
import type { GrowthModelSubject } from "../growth/model-contract.js";

export type VfxrM1asSpriteSourceKind = "m1as-image" | "m1as-video" | "m1as-glb-snapshot";
export interface VfxrM1asStreamedAssetInput {
  asset: M1asAsset;
  signedUrl: string;
  userId: string;
  subjectId?: string;
  targetHeightMeters?: number;
  /** GLB is represented by the existing M1AS static GLB-snapshot surface, not a live animated render. */
  glbProjection?: "snapshot";
}
export type VfxrTextureResolver = (url: string, mimeType: string, options: { userId: string; label: string; flipY: boolean; resolver: M1ASFaceSurfaceResolver }) => Promise<ManagedTextureHandle>;
export interface VfxrM1asStreamedSpriteSubject {
  source: { assetId: string; displayName: string; mimeType: string; sourceKind: VfxrM1asSpriteSourceKind; streamCapability: "declared" | "unspecified" };
  subject: GrowthModelSubject;
  sprite: THREE.Sprite;
  growthModel: TwoDimensionalSpriteGrowthModel;
  dispose(): void;
}
function classify(asset: M1asAsset, glbProjection?: "snapshot"): VfxrM1asSpriteSourceKind {
  const mime = asset.mimeType.toLowerCase().trim();
  if (mime.startsWith("image/")) return "m1as-image";
  if (mime.startsWith("video/")) return "m1as-video";
  if ((mime.includes("gltf") || mime.includes("model/gltf-binary") || asset.displayName.toLowerCase().endsWith(".glb")) && glbProjection === "snapshot") return "m1as-glb-snapshot";
  throw new TypeError("VFXR streamed sprite input supports image/*, video/*, or an explicitly requested GLB snapshot projection.");
}
function dimensions(texture: THREE.Texture): { width: number; height: number } {
  const image = texture.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number; videoWidth?: number; videoHeight?: number } | undefined;
  const width = image?.videoWidth || image?.naturalWidth || image?.width || 0;
  const height = image?.videoHeight || image?.naturalHeight || image?.height || 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Resolved M1AS texture has no measurable 2D dimensions.");
  }
  return { width, height };
}
/**
 * Resolves an authenticated M1AS signed stream into a VFXR 2D sprite subject.
 * The asset ID remains the stable identity; the signed URL is transport only.
 */
export async function loadVfxrM1asStreamedSprite(
  input: VfxrM1asStreamedAssetInput,
  resolver: VfxrTextureResolver = resolveM1ASTexture,
): Promise<VfxrM1asStreamedSpriteSubject> {
  const { asset } = input;
  if (!asset || !asset.id?.trim() || !asset.displayName?.trim() || !asset.mimeType?.trim()) throw new TypeError("M1AS asset identity and MIME metadata are required.");
  if (!input.signedUrl?.trim() || !input.userId?.trim()) throw new TypeError("An M1AS signed stream URL and authenticated user ID are required.");
  if (asset.capabilities?.canStream === false) throw new Error("M1AS asset metadata explicitly denies streaming.");
  const targetHeight = input.targetHeightMeters ?? 1;
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) throw new RangeError("Target sprite height must be finite positive metres.");
  const sourceKind = classify(asset, input.glbProjection);
  const surfaceResolver = new M1ASFaceSurfaceResolver(input.userId);
  const resolverMime = sourceKind === "m1as-glb-snapshot" ? "model/gltf-binary" : asset.mimeType;
  let handle: ManagedTextureHandle;
  try {
    handle = await resolver(input.signedUrl, resolverMime, { userId: input.userId, label: asset.displayName, flipY: sourceKind === "m1as-image", resolver: surfaceResolver });
  } catch (error) {
    surfaceResolver.destroy();
    throw error;
  }
  try {
    const size = dimensions(handle.texture);
    const widthMeters = targetHeight * size.width / size.height;
    const material = new THREE.SpriteMaterial({ map: handle.texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(widthMeters, targetHeight, 1);
    const subjectId = input.subjectId?.trim() || "m1as-asset:" + asset.id;
    const subject: GrowthModelSubject = {
      subjectId,
      assetId: asset.id,
      assetKind: sourceKind,
      initialDimensions: { x: widthMeters, y: targetHeight, z: 0 },
      worldUnit: "m",
    };
    const growthModel = new TwoDimensionalSpriteGrowthModel(sprite);
    let disposed = false;
    return {
      source: { assetId: asset.id, displayName: asset.displayName, mimeType: asset.mimeType, sourceKind, streamCapability: asset.capabilities?.canStream === true ? "declared" : "unspecified" },
      subject, sprite, growthModel,
      dispose() {
        if (disposed) return;
        disposed = true;
        growthModel.dispose();
        material.dispose();
        handle.dispose();
        surfaceResolver.destroy();
      },
    };
  } catch (error) {
    handle.dispose();
    surfaceResolver.destroy();
    throw error;
  }
}
