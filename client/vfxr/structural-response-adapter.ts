import type {
  PortableAdapterExecution,
  PortableEngineAdapter,
  PortableEngineDescriptor,
  PortableEvaluationCommand,
  PortableEvaluationContext,
  PortableTranslationResult,
} from "../evaluation/portable-evaluation-router.js";
import type {
  StructuralResponseAssetReference,
  StructuralResponseEffectKind,
  StructuralResponseEvent,
} from "../evaluation/environment-structural-response-contract.js";

export type VfxrStructuralApplyResult =
  | { accepted: true; output?: Record<string, string | number | boolean | null>; telemetry?: Record<string, string | number | boolean | null> }
  | { accepted: false; reason: string };

export interface VfxrStructuralEffectTarget {
  readonly targetId: string;
  readonly supportedEffectKinds: StructuralResponseEffectKind[];
  readonly supportedAssetKinds: StructuralResponseAssetReference["kind"][];
  apply(event: StructuralResponseEvent): VfxrStructuralApplyResult | Promise<VfxrStructuralApplyResult>;
  clear?(eventId: string): void | Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStructuralEvent(value: unknown): value is StructuralResponseEvent {
  if (!isRecord(value)) return false;
  return value.schemaVersion === "big3r-environment-structural-response/1.0" &&
    typeof value.eventId === "string" && typeof value.ruleId === "string" &&
    typeof value.responseId === "string" && typeof value.targetId === "string" &&
    typeof value.effectKind === "string" && typeof value.channel === "string" &&
    typeof value.subjectId === "string" && typeof value.referenceId === "string" &&
    typeof value.simulationTimeSeconds === "number" && Number.isFinite(value.simulationTimeSeconds);
}

/**
 * VFXR consumer for shared structural-response events.
 *
 * It routes to explicitly registered 2D/2.5D effect targets such as sprite
 * sequences, WEBM overlays, or procedural layers. It does not create assets,
 * infer missing targets, or change structural/physics authority.
 */
export class VfxrStructuralResponseAdapter implements PortableEngineAdapter {
  private readonly targets = new Map<string, VfxrStructuralEffectTarget>();

  public readonly descriptor: PortableEngineDescriptor = {
    id: "vfxr.structural-response",
    displayName: "VFXR Structural Response Adapter",
    version: "1.0.0",
    domains: {
      "structural-response": {
        status: "native",
        operations: ["apply-structural-response", "clear-structural-response"],
        limitations: [
          "Consumes shared response events; does not evaluate physical loads or structural damage.",
          "Requires an explicitly registered VFXR target and authored asset reference.",
          "Sprite, WEBM, and procedural rendering remain owned by the registered VFXR target.",
        ],
      },
    },
  };

  public register(target: VfxrStructuralEffectTarget): () => void {
    if (!target.targetId.trim()) throw new TypeError("VFXR structural targetId is required.");
    if (this.targets.has(target.targetId)) {
      throw new Error(`VFXR structural target "${target.targetId}" is already registered.`);
    }
    if (!target.supportedEffectKinds.length || !target.supportedAssetKinds.length) {
      throw new TypeError("VFXR structural targets must declare effect and asset capabilities.");
    }
    this.targets.set(target.targetId, target);
    return () => {
      if (this.targets.get(target.targetId) === target) this.targets.delete(target.targetId);
    };
  }

  public translate(
    command: PortableEvaluationCommand,
    _context: PortableEvaluationContext,
  ): PortableTranslationResult {
    if (command.domain !== "structural-response" || command.operation !== "apply-structural-response") {
      if (command.domain === "structural-response" && command.operation === "clear-structural-response") {
        return { status: "native", notes: [] };
      }
      return { status: "unsupported", notes: ["VFXR structural adapter does not support this operation."] };
    }
    if (!isStructuralEvent(command.payload)) {
      return { status: "unsupported", notes: ["Command payload is not a valid targeted structural response event."] };
    }
    const event = command.payload;
    if (event.channel !== "visual-effect" && event.channel !== "audio-effect") {
      return { status: "unsupported", notes: [`VFXR cannot own the ${event.channel} response channel.`] };
    }
    if (!event.asset) {
      return { status: "unsupported", notes: ["VFXR response requires an authored sprite, WEBM, effect-preset, or procedural asset reference."] };
    }
    const target = this.targets.get(event.targetId!);
    if (!target) {
      return { status: "unsupported", notes: [`VFXR target "${event.targetId}" is not registered.`] };
    }
    if (!target.supportedEffectKinds.includes(event.effectKind)) {
      return { status: "unsupported", notes: [`Target "${target.targetId}" does not support effect kind "${event.effectKind}".`] };
    }
    if (!target.supportedAssetKinds.includes(event.asset.kind)) {
      return { status: "unsupported", notes: [`Target "${target.targetId}" does not support asset kind "${event.asset.kind}".`] };
    }
    return { status: "native", notes: [] };
  }

  public async execute(
    command: PortableEvaluationCommand,
    _context: PortableEvaluationContext,
  ): Promise<PortableAdapterExecution> {
    if (command.operation === "clear-structural-response") {
      const targetId = isRecord(command.payload) && typeof command.payload.targetId === "string"
        ? command.payload.targetId : "";
      const eventId = isRecord(command.payload) && typeof command.payload.eventId === "string"
        ? command.payload.eventId : "";
      const target = this.targets.get(targetId);
      if (!target || !eventId) return { accepted: false, reason: "A registered targetId and eventId are required to clear a VFXR response." };
      await target.clear?.(eventId);
      return { accepted: true, output: { targetId, eventId, cleared: true } };
    }
    if (!isStructuralEvent(command.payload) || !command.payload.targetId ||\n        !command.payload.asset || !command.payload.asset.assetId?.trim()) {
      return { accepted: false, reason: "A valid targeted structural response event is required." };
    }
    const event = command.payload;
    const target = this.targets.get(event.targetId);
    if (!target) return { accepted: false, reason: `VFXR target "${event.targetId}" is not registered.` };
    const result = await target.apply(event);
    return {
      accepted: result.accepted,
      ...(result.accepted ? {
        output: result.output,
        telemetry: {
          targetId: target.targetId,
          eventId: event.eventId,
          effectKind: event.effectKind,
          assetId: event.asset.assetId,
          pipeline: "VFXR",
          ...(result.telemetry ?? {}),
        },
      } : { reason: result.reason }),
    };
  }
}
