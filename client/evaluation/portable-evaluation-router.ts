/**
 * Portable evaluation boundary for BIG3R and VFXR.
 *
 * This layer routes data-driven evaluation commands to existing engine adapters.
 * It does not own growth, camera, scaling, animation, or stage behavior.
 * Each underlying engine remains authoritative for its own execution.
 */

export type PortableEvaluationDomain =
  | "growth"
  | "actual-scaling"
  | "stage-scaling"
  | "camera"
  | "anchors"
  | "animation"
  | "deformation"
  | "breathing"
  | "shadow"
  | "horizon"
  | "profile"
  | "volume"
  | "stage"
  | "structural-response";

export type PortableJsonValue =
  | string
  | number
  | boolean
  | null
  | PortableJsonValue[]
  | { [key: string]: PortableJsonValue };

export interface PortableEvaluationSubject {
  subjectId: string;
  assetId: string;
  assetKind: string;
  source: "m1as-stream" | "local" | "generated" | "external";
}

export interface PortableEvaluationContext {
  experimentId: string;
  subject: PortableEvaluationSubject;
  simulationTimeSeconds: number;
  configurationVersion: string;
  randomSeed?: number;
}

export interface PortableEvaluationCommand {
  commandId: string;
  domain: PortableEvaluationDomain;
  operation: string;
  payload: PortableJsonValue;
  /** Required when more than one registered adapter can execute this command. */
  targetAdapterId?: string;
}

export type PortableCapabilityStatus = "native" | "translated" | "approximated" | "unsupported";

export interface PortableDomainCapability {
  status: PortableCapabilityStatus;
  /** Operations accepted at the shared harness boundary. */
  operations: string[];
  limitations?: string[];
}

export interface PortableEngineDescriptor {
  id: string;
  displayName: string;
  version: string;
  /** A domain is absent when the adapter makes no claim about it. */
  domains: Partial<Record<PortableEvaluationDomain, PortableDomainCapability>>;
}

export interface PortableTranslationResult {
  status: Exclude<PortableCapabilityStatus, "unsupported"> | "unsupported";
  /** Omit for a native pass-through. Translated commands retain commandId and domain. */
  translatedCommand?: PortableEvaluationCommand;
  /** Required when status is approximated; explains the measurable semantic difference. */
  notes: string[];
}

export interface PortableAdapterExecution {
  accepted: boolean;
  reason?: string;
  output?: PortableJsonValue;
  telemetry?: PortableJsonValue;
}

export interface PortableEngineAdapter {
  readonly descriptor: PortableEngineDescriptor;
  translate(
    command: PortableEvaluationCommand,
    context: PortableEvaluationContext,
  ): Promise<PortableTranslationResult> | PortableTranslationResult;
  execute(
    command: PortableEvaluationCommand,
    context: PortableEvaluationContext,
  ): Promise<PortableAdapterExecution> | PortableAdapterExecution;
}

export type PortableExecutionStatus =
  | "executed"
  | "rejected"
  | "unsupported"
  | "ambiguous"
  | "translation-failed";

export interface PortableExecutionRecord {
  commandId: string;
  status: PortableExecutionStatus;
  domain: PortableEvaluationDomain;
  sourceCommand: PortableEvaluationCommand;
  translatedCommand?: PortableEvaluationCommand;
  adapterId?: string;
  adapterVersion?: string;
  translationStatus?: PortableCapabilityStatus;
  translationNotes: string[];
  simulationTimeSeconds: number;
  configurationVersion: string;
  reason?: string;
  output?: PortableJsonValue;
  telemetry?: PortableJsonValue;
}

/**
 * Routes commands without merging the responsibilities of the underlying
 * engines. Ambiguous ownership is reported instead of choosing a fallback.
 */
export class PortableEvaluationRouter {
  private readonly adapters = new Map<string, PortableEngineAdapter>();

  register(adapter: PortableEngineAdapter): () => void {
    const id = adapter.descriptor.id.trim();
    if (!id) throw new Error("Portable engine adapter requires a non-empty id.");
    if (this.adapters.has(id)) throw new Error(`Portable engine adapter "${id}" is already registered.`);
    this.adapters.set(id, adapter);
    return () => {
      if (this.adapters.get(id) === adapter) this.adapters.delete(id);
    };
  }

  getDescriptors(): PortableEngineDescriptor[] {
    return Array.from(this.adapters.values(), (adapter) => adapter.descriptor);
  }

  async route(
    command: PortableEvaluationCommand,
    context: PortableEvaluationContext,
  ): Promise<PortableExecutionRecord> {
    const base: Pick<PortableExecutionRecord,
      "commandId" | "domain" | "sourceCommand" | "translationNotes" |
      "simulationTimeSeconds" | "configurationVersion"> = {
        commandId: command.commandId,
        domain: command.domain,
        sourceCommand: command,
        translationNotes: [],
        simulationTimeSeconds: context.simulationTimeSeconds,
        configurationVersion: context.configurationVersion,
      };

    if (!command.commandId.trim() || !command.operation.trim()) {
      return { ...base, status: "rejected", reason: "Command id and operation are required." };
    }
    if (!Number.isFinite(context.simulationTimeSeconds) || context.simulationTimeSeconds < 0) {
      return { ...base, status: "rejected", reason: "Simulation time must be finite and non-negative." };
    }

    const candidates = Array.from(this.adapters.values()).filter((adapter) => {
      if (command.targetAdapterId && adapter.descriptor.id !== command.targetAdapterId) return false;
      const capability = adapter.descriptor.domains[command.domain];
      return Boolean(
        capability &&
        capability.status !== "unsupported" &&
        capability.operations.includes(command.operation),
      );
    });

    if (candidates.length === 0) {
      return {
        ...base,
        status: "unsupported",
        reason: command.targetAdapterId
          ? `Adapter "${command.targetAdapterId}" does not advertise ${command.domain}:${command.operation}.`
          : `No registered adapter advertises ${command.domain}:${command.operation}.`,
      };
    }
    if (candidates.length > 1) {
      return {
        ...base,
        status: "ambiguous",
        reason: `Multiple adapters advertise ${command.domain}:${command.operation}; specify targetAdapterId.`,
      };
    }

    const adapter = candidates[0];
    const adapterFields = {
      adapterId: adapter.descriptor.id,
      adapterVersion: adapter.descriptor.version,
    };

    let translation: PortableTranslationResult;
    try {
      translation = await adapter.translate(command, context);
    } catch (error) {
      return {
        ...base,
        ...adapterFields,
        status: "translation-failed",
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    if (translation.status === "unsupported") {
      return {
        ...base,
        ...adapterFields,
        status: "unsupported",
        translationStatus: "unsupported",
        translationNotes: translation.notes,
        reason: translation.notes.join(" ") || "Adapter declined to translate this command.",
      };
    }

    const translatedCommand = translation.translatedCommand ?? command;
    if (
      translatedCommand.commandId !== command.commandId ||
      translatedCommand.domain !== command.domain ||
      !translatedCommand.operation.trim()
    ) {
      return {
        ...base,
        ...adapterFields,
        status: "translation-failed",
        translationStatus: translation.status,
        translationNotes: translation.notes,
        reason: "Translation must preserve commandId and domain and provide a non-empty operation.",
      };
    }

    if (translation.status === "approximated" && translation.notes.length === 0) {
      return {
        ...base,
        ...adapterFields,
        status: "translation-failed",
        translationStatus: "approximated",
        reason: "Approximated translations must document their semantic differences.",
      };
    }

    try {
      const result = await adapter.execute(translatedCommand, context);
      return {
        ...base,
        ...adapterFields,
        status: result.accepted ? "executed" : "rejected",
        translatedCommand,
        translationStatus: translation.status,
        translationNotes: translation.notes,
        reason: result.reason,
        output: result.output,
        telemetry: result.telemetry,
      };
    } catch (error) {
      return {
        ...base,
        ...adapterFields,
        status: "rejected",
        translatedCommand,
        translationStatus: translation.status,
        translationNotes: translation.notes,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
