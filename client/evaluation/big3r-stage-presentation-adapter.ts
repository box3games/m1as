import type { CameraRigMode } from "../big3r/camera/CameraRig5Mode.js";
import type {
  PortableAdapterExecution,
  PortableEngineAdapter,
  PortableEvaluationCommand,
  PortableEvaluationContext,
  PortableTranslationResult,
} from "./portable-evaluation-router.js";

/**
 * Thin BIG3R presentation bridge. It delegates to Big3rStageCoordinator;
 * it does not duplicate camera or stage behavior.
 *
 * This first slice intentionally advertises only the controls that the
 * coordinator currently exposes. Anchors, stage-relative scaling, horizon,
 * shadow, profile and volume controls remain unadvertised until their native
 * owners expose stable APIs.
 */
export interface Big3rStagePresentationPort {
  getCameraRigMode(): CameraRigMode;
  setCameraRigMode(mode: CameraRigMode): void;
  getRoomDoubleSided(): boolean;
  setRoomDoubleSided(enabled: boolean): void;
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
      (command.domain === "stage" && ["get-room-double-sided", "set-room-double-sided"].includes(command.operation))
    ) {
      return { status: "native", notes: [], translatedCommand: command };
    }
    return { status: "unsupported", notes: ["Operation is not exposed by the current BIG3R stage coordinator."] };
  }

  execute(
    command: PortableEvaluationCommand,
    _context: PortableEvaluationContext,
  ): PortableAdapterExecution {
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
    if (command.domain === "stage" && command.operation === "set-room-double-sided") {
      const enabled = (command.payload as { enabled: boolean }).enabled;
      this.stage.setRoomDoubleSided(enabled);
      return { accepted: true, output: { enabled: this.stage.getRoomDoubleSided() } };
    }
    return { accepted: false, reason: "Operation is not supported by the BIG3R stage presentation adapter." };
  }
}
