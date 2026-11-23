/**
 * Renderer-neutral capability declaration for BIG3R subject presentations.
 *
 * A renderer advertises what it can actually observe or control. Shared camera
 * and anchor systems consume this descriptor; they do not assume every
 * representation has a 3D transform, skeleton, depth, or writable anchors.
 */

export type SubjectRepresentationKind =
  | "2d-sprite"
  | "2d-vector"
  | "2.5d-plane"
  | "3d-scene"
  | "hologram"
  | "composite";

export type RendererCoordinateSpace =
  | "sprite-local"
  | "plane-local"
  | "subject-local"
  | "stage-world"
  | "camera-relative"
  | "screen-normalized"
  | "viewport-normalized";

export type RendererCapabilityStatus =
  | "native"
  | "translated"
  | "approximated"
  | "unsupported";

export type RendererCapability =
  | "read-anchors"
  | "write-anchors"
  | "sprite-bounds"
  | "plane-bounds"
  | "geometry-bounds"
  | "skeleton-hierarchy"
  | "world-transform"
  | "depth"
  | "parallax"
  | "screen-projection"
  | "occlusion"
  | "camera-attachment-hard"
  | "camera-attachment-soft"
  | "camera-attachment-look-at";

export interface RendererCapabilityDeclaration {
  status: RendererCapabilityStatus;
  /** Required for translated or approximated behavior; explains the mapping. */
  notes?: string;
}

export interface RendererCapabilityDescriptor {
  schemaVersion: "big3r-renderer-capabilities/1.0";
  rendererId: string;
  rendererVersion: string;
  representationKind: SubjectRepresentationKind;
  /** Coordinate spaces this renderer can supply without fabricating transforms. */
  coordinateSpaces: RendererCoordinateSpace[];
  capabilities: Partial<Record<RendererCapability, RendererCapabilityDeclaration>>;
}

const VALID_REPRESENTATIONS: readonly SubjectRepresentationKind[] = [
  "2d-sprite", "2d-vector", "2.5d-plane", "3d-scene", "hologram", "composite",
];

const VALID_SPACES: readonly RendererCoordinateSpace[] = [
  "sprite-local", "plane-local", "subject-local", "stage-world",
  "camera-relative", "screen-normalized",
];

const VALID_STATUSES: readonly RendererCapabilityStatus[] = [
  "native", "translated", "approximated", "unsupported",
];

const VALID_CAPABILITIES: readonly RendererCapability[] = [
  "read-anchors", "write-anchors", "sprite-bounds", "plane-bounds",
  "geometry-bounds", "skeleton-hierarchy", "world-transform", "depth",
  "parallax", "screen-projection", "occlusion", "camera-attachment-hard",
  "camera-attachment-soft", "camera-attachment-look-at",
];

/** Validate identity, coordinate-space declarations, and explicit capability provenance. */
export function validateRendererCapabilityDescriptor(
  descriptor: RendererCapabilityDescriptor,
): void {
  if (descriptor.schemaVersion !== "big3r-renderer-capabilities/1.0") {
    throw new TypeError("Renderer capability descriptor has an unsupported schema version.");
  }
  if (!descriptor.rendererId?.trim() || !descriptor.rendererVersion?.trim()) {
    throw new TypeError("Renderer identity and version are required.");
  }
  if (!VALID_REPRESENTATIONS.includes(descriptor.representationKind)) {
    throw new TypeError("Renderer representation kind is unsupported.");
  }
  if (!Array.isArray(descriptor.coordinateSpaces) || descriptor.coordinateSpaces.length === 0) {
    throw new RangeError("At least one renderer coordinate space must be declared.");
  }
  const spaces = new Set<RendererCoordinateSpace>();
  for (const space of descriptor.coordinateSpaces) {
    if (!VALID_SPACES.includes(space) || spaces.has(space)) {
      throw new TypeError(`Invalid or duplicate renderer coordinate space "${space}".`);
    }
    spaces.add(space);
  }
  for (const [name, declaration] of Object.entries(descriptor.capabilities)) {
    if (!VALID_CAPABILITIES.includes(name as RendererCapability)) {
      throw new TypeError(`Unknown renderer capability "${name}".`);
    }
    if (!declaration || !VALID_STATUSES.includes(declaration.status)) {
      throw new TypeError(`Renderer capability "${name}" has an invalid status.`);
    }
    if ((declaration.status === "translated" || declaration.status === "approximated") &&
        !declaration.notes?.trim()) {
      throw new TypeError(`Renderer capability "${name}" requires notes for non-native support.`);
    }
  }
}

/** Query only explicitly declared support; absent capabilities are unsupported, never inferred. */
export function getRendererCapabilityStatus(
  descriptor: RendererCapabilityDescriptor,
  capability: RendererCapability,
): RendererCapabilityStatus {
  return descriptor.capabilities[capability]?.status ?? "unsupported";
}
