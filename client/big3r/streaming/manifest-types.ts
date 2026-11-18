export type RoomSlotKind = 'm1as_wall_interior' | 'm1as_window_portal';

export interface PortalRect2D {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  visible: boolean;
}

export interface LevelQuadSlotDef {
  slotId: string;
  kind: RoomSlotKind;
  faceIndex: 0 | 1 | 2 | 3 | 4 | 5;
  assetUrl?: string;
  mimeType?: string;
  label?: string;
  /** Optional normalized sub-rect on the wall [u0, v0, u1, v1] for window portals */
  portalUvRect?: [number, number, number, number];
}

export interface LevelPropDef {
  propId: string;
  glbUrl: string;
  name: string;
  role: 'consumable' | 'wearable' | 'container' | 'growth-gate' | 'reference';
  targetHeight: number;
  x: number;
  z: number;
  overlayWebmUrl?: string;
  isInjectorDrain?: boolean;
}

export interface ScaleTierManifest {
  tierId: string;
  tierIndex: number;
  displayName: string;
  /** Logical real-world height in meters for UI HUD, posture & audio pitch */
  metricHeight: number;
  /** Normalized rebase trigger threshold (default 2.0) */
  rebasingThreshold: number;
  nextTierId: string | null;
  roomWidth: number;
  roomHeight: number;
  roomDepth: number;
  slots: LevelQuadSlotDef[];
  props: LevelPropDef[];
}

export interface JSONLevelManifest {
  manifestId: string;
  version: string;
  maxActiveVideoDecoders: number;
  initialTierId: string;
  tiers: ScaleTierManifest[];
}
