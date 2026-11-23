import type { GrowthModel, GrowthModelCommand, GrowthModelContext, GrowthModelSubject } from "../growth/model-contract.js";
import type {
  PortableAdapterExecution,
  PortableEngineAdapter,
  PortableEvaluationCommand,
  PortableEvaluationContext,
  PortableEngineDescriptor,
  PortableTranslationResult,
} from "./portable-evaluation-router.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isGrowthModelCommand(value: unknown): value is GrowthModelCommand {
  if (!isRecord(value) || typeof value.commandId !== "string" || !value.commandId.trim()) return false;
  if (value.kind === "hold") return typeof value.active === "boolean";
  if (value.kind === "flow") {
    return typeof value.flowMultiplier === "number" &&
      Number.isFinite(value.flowMultiplier) && value.flowMultiplier >= 0 &&
      typeof value.supplySeconds === "number" &&
      Number.isFinite(value.supplySeconds) && value.supplySeconds >= 0;
  }
  if (value.kind === "discrete") {
    if (!isRecord(value.amount)) return false;
    if (value.amount.kind === "relative_change") {
      return typeof value.amount.fraction === "number" && Number.isFinite(value.amount.fraction) &&
        value.amount.fraction >= 0;
    }
    if (value.amount.kind === "absolute_target") {
      return typeof value.amount.scale === "number" && Number.isFinite(value.amount.scale) &&
        value.amount.scale > 0;
    }
  }
  return false;
}

function asJson(value: unknown): PortableAdapterExecution["telemetry"] {
  if (value === undefined) return undefined;
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? undefined : JSON.parse(serialized);
  } catch {
    return undefined;
  }
}

function contextFor(context: PortableEvaluationContext): GrowthModelContext {
  return {
    experimentId: context.experimentId,
    simulationTimeSeconds: context.simulationTimeSeconds,
    configurationVersion: context.configurationVersion,
    randomSeed: context.randomSeed,
  };
}

/**
 * Bridges an existing GrowthModel implementation into the portable router.
 * It never owns the model's clock, initialization, reset, or disposal lifecycle.
 */
export class GrowthModelPortableAdapter implements PortableEngineAdapter {
  readonly descriptor: PortableEngineDescriptor;

  constructor(
    private readonly model: GrowthModel,
    private readonly subject: GrowthModelSubject,
  ) {
    const capabilities = model.descriptor.capabilities;
    const operations: string[] = [];
    if (capabilities.wholeObjectScale || capabilities.regionalGrowth) operations.push("discrete");
    if (capabilities.sustainedFlow) operations.push("flow");
    this.descriptor = {
      id: model.descriptor.id,
      displayName: model.descriptor.displayName,
      version: model.descriptor.version,
      domains: {
        growth: {
          status: "translated",
          operations,
          limitations: [
            "Growth commands are translated to the existing GrowthModel contract.",
            "The underlying engine retains its own simulation loop and lifecycle.",
          ],
        },
      },
    };
  }

  initialize(context: PortableEvaluationContext): void {
    this.model.initialize(this.subject, contextFor(context));
  }

  translate(
    command: PortableEvaluationCommand,
    context: PortableEvaluationContext,
  ): PortableTranslationResult {
    if (!this.model.descriptor.capabilities.supportedAssetKinds.includes(context.subject.assetKind)) {
      return {
        status: "unsupported",
        notes: [`Growth model "${this.model.descriptor.id}" does not support asset kind "${context.subject.assetKind}".`],
      };
    }
    if (command.domain !== "growth" || !["discrete", "flow", "hold"].includes(command.operation)) {
      return { status: "unsupported", notes: ["GrowthModel adapters accept discrete and flow commands only when advertised."] };
    }
    if (command.operation === "hold") {
      return { status: "unsupported", notes: ["The shared GrowthModel capability contract does not yet declare hold support."] };
    }
    if (!isGrowthModelCommand(command.payload)) {
      return { status: "unsupported", notes: ["Payload does not satisfy the GrowthModelCommand contract."] };
    }
    if (command.payload.kind !== command.operation || command.payload.commandId !== command.commandId) {
      return { status: "unsupported", notes: ["Command operation and identity must match the GrowthModelCommand payload."] };
    }
    return {
      status: "translated",
      notes: ["Portable growth command mapped to the existing GrowthModel command contract."],
      translatedCommand: command,
    };
  }

  async execute(
    command: PortableEvaluationCommand,
    context: PortableEvaluationContext,
  ): Promise<PortableAdapterExecution> {
    if (!isGrowthModelCommand(command.payload)) {
      return { accepted: false, reason: "Translated payload is not a valid GrowthModelCommand." };
    }
    const result = await this.model.apply(command.payload, contextFor(context));
    return {
      accepted: result.accepted,
      reason: result.reason,
      output: asJson({ commandId: result.commandId, accepted: result.accepted, reason: result.reason }),
      telemetry: asJson(result.telemetry),
    };
  }
}
