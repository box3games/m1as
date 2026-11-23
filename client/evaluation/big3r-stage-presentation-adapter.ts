import type { CameraRigMode } from "../big3r/camera/CameraRig5Mode.js";
import type { PortableAnchorSnapshot } from "./portable-anchor-contract.js";
import type {
  PortableAdapterExecution,
  PortableEngineAdapter,
  PortableEvaluationCommand,
  PortableEvaluationContext,
  PortableTranslationResult,
  PortableJsonValue,
} from "./portable-evaluation-router.js";

/**
 * Thin BIG3R presentation bridge. It delegates to Big3rStageCoordinator;
 * it does not duplicate camera or stage behavior.
 *
 * This first slice intentionally advertises only the controls that the
 * coordinator currently exposes. Stage-relative scaling is read-only through
 * the native ScaleRebaseController snapshot. Runtime anchors are read-only and
 * explicitly distinguish measured bounds from authored anatomical landmarks.
 */
export interface Big3rStagePresentationPort {
  getPortableAnchorSnapshot(subjectId: string, configurationVersion: string): PortableAnchorSnapshot | { status: "not_captured"; reason: string };
  getCameraRigMode(): CameraRigMode;
  setCameraRigMode(mode: CameraRigMode): void;
  getRoomDoubleSided(): boolean;
  setRoomDoubleSided(enabled: boolean): void;
  getActualScaleEvaluationSnapshot(): {
    growthModel: string;
    currentVisualScale: number;
  };
  getStageScaleEvaluationSnapshot():
    | {
        status: "available";
        activeTierId: string;
        activeTierName: string;
        metricHeight: number;
        normalizedPlayerScale: number;
        activeTierWorldScale: number;
        prewarmedTierWorldScale: number;
        progress01: number;
        rebaseCount: number;
        effectiveMetricHeight: number;
      }
    | { status: "not_captured"; reason: string };
}

function isCameraRigMode(value: unknown): value is CameraRigMode {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

export class Big3rStagePresentationAdapter implements PortableEngineAdapter {
  public readonly descriptor = {
    id: "big3r-stage-presentation",
    displayName: "BIG3R Stage Presentation",
    version: "1.0.0",
    domains: {
      camera: {
        status: "native" as const,
        operations: ["get-mode", "set-mode"],
        limitations: [
          "Exposes the existing five CameraRig5Mode presets only.",
          "Tube-ceiling-growth-specific camera parameters are not exposed by this coordinator.",
        ],
      },
      stage: {
        status: "native" as const,
        operations: ["get-room-double-sided", "set-room-double-sided"],
      },
      "actual-scaling": {
        status: "native" as const,
        operations: ["get-current"],
        limitations: ["Read-only snapshot of the active growth model's current visual scale; changes remain owned by that growth model."],
      },
      anchors: {
        status: "native" as const,
        operations: ["get-current"],
        limitations: ["Read-only runtime anchors include subject origin and measured geometry bounds, every discovered GLB rig bone with its node name/hierarchy, stage origin, camera position/focus, and measured bounds for scene props explicitly registered with role reference. Semantic anatomy mapping and authored environment landmark editing are not yet available."],
      },
      "stage-scaling": {
        status: "native" as const,
        operations: ["get-current"],
        limitations: ["Read-only snapshot of ScaleRebaseController and active stage manifest; unavailable until a streaming manifest has produced its first frame."],
      },
    },
  };

  constructor(private readonly stage: Big3rStagePresentationPort) {}

  translate(
    command: PortableEvaluationCommand,
    _context: PortableEvaluationContext,
  ): PortableTranslationResult {
    if (command.domain === "camera" && command.operation === "set-mode") {
      if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)) {
        return { status: "unsupported", notes: ["camera:set-mode requires an object payload containing mode."] };
      }
      const mode = (command.payload as Record<string, unknown>).mode;
      if (!isCameraRigMode(mode)) {
        return { status: "unsupported", notes: ["Camera mode must be one of 1, 2, 3, 4 or 5."] };
      }
    }

    if (command.domain === "stage" && command.operation === "set-room-double-sided") {
      if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload) ||
          typeof (command.payload as Record<string, unknown>).enabled !== "boolean") {
        return { status: "unsupported", notes: ["stage:set-room-double-sided requires a boolean enabled value."] };
      }
    }

    if (
      (command.domain === "camera" && ["get-mode", "set-mode"].includes(command.operation)) ||
      (command.domain === "stage" && ["get-room-double-sided", "set-room-double-sided"].includes(command.operation)) ||
      ((command.domain === "actual-scaling" || command.domain === "stage-scaling" || command.domain === "anchors") && command.operation === "get-current" && command.payload === null)
    ) {
      return { status: "native", notes: [], translatedCommand: command };
    }
    return { status: "unsupported", notes: ["Operation is not exposed by the current BIG3R stage coordinator."] };
  }

  execute(
    command: PortableEvaluationCommand,
    _context: PortableEvaluationContext,
  ): PortableAdapterExecution {
    if (command.domain === "anchors" && command.operation === "get-current") {
      const snapshot = this.stage.getPortableAnchorSnapshot(_context.subject.subjectId, _context.configurationVersion);
      const output = JSON.parse(JSON.stringify(snapshot)) as PortableJsonValue;
      return { accepted: true, output };
    }
    if (command.domain === "camera" && command.operation === "get-mode") {
      return { accepted: true, output: { mode: this.stage.getCameraRigMode() } };
    }
    if (command.domain === "camera" && command.operation === "set-mode") {
      const mode = (command.payload as { mode: CameraRigMode }).mode;
      this.stage.setCameraRigMode(mode);
      return { accepted: true, output: { mode: this.stage.getCameraRigMode() } };
    }
    if (command.domain === "stage" && command.operation === "get-room-double-sided") {
      return { accepted: true, output: { enabled: this.stage.getRoomDoubleSided() } };
    }
    if (command.domain === "actual-scaling" && command.operation === "get-current") {
      return { accepted: true, output: this.stage.getActualScaleEvaluationSnapshot() };
    }
    if (command.domain === "stage-scaling" && command.operation === "get-current") {
      return { accepted: true, output: this.stage.getStageScaleEvaluationSnapshot() };
    }
    if (command.domain === "stage" && command.operation === "set-room-double-sided") {
      const enabled = (command.payload as { enabled: boolean }).enabled;
      this.stage.setRoomDoubleSided(enabled);
      return { accepted: true, output: { enabled: this.stage.getRoomDoubleSided() } };
    }
    return { accepted: false, reason: "Operation is not supported by the BIG3R stage presentation adapter." };
  }
}
