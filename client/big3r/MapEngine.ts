import * as THREE from 'three';
import type {
  LevelQuadSlotDef,
  PortalRect2D,
  RoomSlotKind,
  ScaleTierManifest,
} from './streaming/manifest-types.js';

export interface BuiltQuadSlot {
  slotId: string;
  kind: RoomSlotKind;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  worldCorners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
}

export interface BuiltTierScene {
  tierId: string;
  group: THREE.Group;
  slots: Map<string, BuiltQuadSlot>;
  portals: BuiltQuadSlot[];
  dispose: () => void;
}

export class MapEngine {
  /**
   * Builds a low-poly quad-based room shell for a ScaleTierManifest.
   */
  public buildTierGeometry(manifest: ScaleTierManifest): BuiltTierScene {
    const group = new THREE.Group();
    group.name = `tier_${manifest.tierId}`;

    const slots = new Map<string, BuiltQuadSlot>();
    const portals: BuiltQuadSlot[] = [];

    const { roomWidth: w, roomHeight: h, roomDepth: d } = manifest;

    for (const slotDef of manifest.slots) {
      const built = this.createQuadSlot(slotDef, w, h, d);
      group.add(built.mesh);
      slots.set(slotDef.slotId, built);
      if (slotDef.kind === 'm1as_window_portal') {
        portals.push(built);
      }
    }

    const dispose = (): void => {
      slots.forEach((slot) => {
        slot.mesh.geometry.dispose();
        if (slot.material.map) {
          slot.material.map.dispose();
          slot.material.map = null;
        }
        slot.material.dispose();
      });
      slots.clear();
      portals.length = 0;
      group.clear();
    };

    return {
      tierId: manifest.tierId,
      group,
      slots,
      portals,
      dispose,
    };
  }

  private createQuadSlot(
    def: LevelQuadSlotDef,
    w: number,
    h: number,
    d: number
  ): BuiltQuadSlot {
    const isPortal = def.kind === 'm1as_window_portal';
    const [u0, v0, u1, v1] = def.portalUvRect ?? [0, 0, 1, 1];
    const spanU = Math.max(0.05, u1 - u0);
    const spanV = Math.max(0.05, v1 - v0);

    let quadW = w;
    let quadH = h;
    const pos = new THREE.Vector3(0, h * 0.5, 0);
    const rot = new THREE.Euler(0, 0, 0);

    // Map cube face index 0..5 (+X, -X, +Y ceiling, -Y floor, +Z, -Z) with inward normals
    switch (def.faceIndex) {
      case 0: // +X right wall
        quadW = d * spanU;
        quadH = h * spanV;
        pos.set(w * 0.5 - (isPortal ? 0.02 : 0), h * (v0 + spanV * 0.5), d * (u0 + spanU * 0.5 - 0.5));
        rot.set(0, -Math.PI * 0.5, 0);
        break;
      case 1: // -X left wall
        quadW = d * spanU;
        quadH = h * spanV;
        pos.set(-w * 0.5 + (isPortal ? 0.02 : 0), h * (v0 + spanV * 0.5), d * (u0 + spanU * 0.5 - 0.5));
        rot.set(0, Math.PI * 0.5, 0);
        break;
      case 2: // +Y ceiling
        quadW = w * spanU;
        quadH = d * spanV;
        pos.set(w * (u0 + spanU * 0.5 - 0.5), h - (isPortal ? 0.02 : 0), d * (v0 + spanV * 0.5 - 0.5));
        rot.set(Math.PI * 0.5, 0, 0);
        break;
      case 3: // -Y floor
        quadW = w * spanU;
        quadH = d * spanV;
        pos.set(w * (u0 + spanU * 0.5 - 0.5), isPortal ? 0.02 : 0, d * (v0 + spanV * 0.5 - 0.5));
        rot.set(-Math.PI * 0.5, 0, 0);
        break;
      case 4: // +Z front wall
        quadW = w * spanU;
        quadH = h * spanV;
        pos.set(w * (u0 + spanU * 0.5 - 0.5), h * (v0 + spanV * 0.5), d * 0.5 - (isPortal ? 0.02 : 0));
        rot.set(0, Math.PI, 0);
        break;
      case 5: // -Z back wall
      default:
        quadW = w * spanU;
        quadH = h * spanV;
        pos.set(w * (u0 + spanU * 0.5 - 0.5), h * (v0 + spanV * 0.5), -d * 0.5 + (isPortal ? 0.02 : 0));
        rot.set(0, 0, 0);
        break;
    }

    const geo = new THREE.PlaneGeometry(quadW, quadH);
    const material = new THREE.MeshStandardMaterial({
      color: isPortal ? 0x38bdf8 : 0x1e293b,
      roughness: isPortal ? 0.2 : 0.88,
      metalness: 0.05,
      transparent: true,
      opacity: def.faceIndex === 2 && !isPortal ? 0.28 : 0.96,
      side: THREE.FrontSide,
    });

    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `${def.kind}:${def.slotId}`;
    mesh.position.copy(pos);
    mesh.rotation.copy(rot);
    mesh.updateMatrix();

    const halfW = quadW * 0.5;
    const halfH = quadH * 0.5;
    const localCorners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
      new THREE.Vector3(-halfW, -halfH, 0),
      new THREE.Vector3(halfW, -halfH, 0),
      new THREE.Vector3(halfW, halfH, 0),
      new THREE.Vector3(-halfW, halfH, 0),
    ];

    const worldCorners = localCorners.map((c) => c.clone().applyMatrix4(mesh.matrix)) as [
      THREE.Vector3,
      THREE.Vector3,
      THREE.Vector3,
      THREE.Vector3,
    ];

    return {
      slotId: def.slotId,
      kind: def.kind,
      mesh,
      material,
      worldCorners,
    };
  }

  /**
   * Projects a portal quad's 4 corners into normalized 2D screen space [-1, 1]
   * to test frustum visibility without raycasting.
   */
  public computePortalRect2D(
    portal: BuiltQuadSlot,
    parentMatrixWorld: THREE.Matrix4,
    camera: THREE.Camera
  ): PortalRect2D {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let anyInFront = false;

    const temp = new THREE.Vector3();
    for (const localCorner of portal.worldCorners) {
      temp.copy(localCorner).applyMatrix4(parentMatrixWorld);
      const viewZ = temp.clone().applyMatrix4(camera.matrixWorldInverse).z;
      if (viewZ < 0) anyInFront = true;

      temp.project(camera);
      minX = Math.min(minX, temp.x);
      minY = Math.min(minY, temp.y);
      maxX = Math.max(maxX, temp.x);
      maxY = Math.max(maxY, temp.y);
    }

    const intersectsScreen =
      anyInFront && maxX >= -1.05 && minX <= 1.05 && maxY >= -1.05 && minY <= 1.05;

    return {
      id: portal.slotId,
      minX,
      minY,
      maxX,
      maxY,
      visible: intersectsScreen,
    };
  }
}
