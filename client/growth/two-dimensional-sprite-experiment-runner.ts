import {
  BiologicalBreathingGrowthModel,
} from "./biological-breathing-model.js";
import {
  BiologicalBreathController,
  type BiologicalBreathConfig,
} from "./biological-breathing.js";
import type {
  GrowthModel,
  GrowthModelCommand,
  GrowthModelContext,
  GrowthModelResult,
  GrowthModelSubject,
  GrowthModelTelemetry,
} from "./model-contract.js";

export const TWO_D_SPRITE_EXPERIMENT_SCHEMA_VERSION = 1 as const;

export type TwoDimensionalSpriteExperimentAction =
  | { kind: "growth"; command: GrowthModelCommand }
  | { kind: "breathing"; active: boolean };

export interface TwoDimensionalSpriteExperimentEvent {
  atSeconds: number;
  action: TwoDimensionalSpriteExperimentAction;
}

export interface TwoDimensionalSpriteExperimentConfig {
  schemaVersion: typeof TWO_D_SPRITE_EXPERIMENT_SCHEMA_VERSION;
  experimentId: string;
  configurationVersion: string;
  subject: GrowthModelSubject;
  durationSeconds: number;
  timestepSeconds: number;
  events: TwoDimensionalSpriteExperimentEvent[];
  biologicalBreathing?: {
    enabled: boolean;
    profile?: Partial<BiologicalBreathConfig>;
  };
}

export interface TwoDimensionalSpriteExperimentSample {
  simulationTimeSeconds: number;
  telemetry: GrowthModelTelemetry;
}

export interface TwoDimensionalSpriteExperimentResult {
  experimentId: string;
  configurationVersion: string;
  modelId: string;
  startedAtSeconds: number;
  endedAtSeconds: number;
  samples: TwoDimensionalSpriteExperimentSample[];
  commandResults: GrowthModelResult[];
}

/** Validation output is designed to be shown directly in a configuration editor. */
export interface SpriteExperimentValidationIssue {
  path: string;
  message: string;
}

export type SpriteExperimentValidationResult =
  | { valid: true; issues: [] }
  | { valid: false; issues: SpriteExperimentValidationIssue[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function validateGrowthCommand(value: unknown, path: string): SpriteExperimentValidationIssue[] {
  const issues: SpriteExperimentValidationIssue[] = [];
  if (!isRecord(value)) return [{ path, message: "Growth command must be an object." }];
  if (!nonEmpty(value.commandId)) issues.push({ path: path + ".commandId", message: "Command ID is required." });

  if (value.kind === "discrete") {
    if (!nonEmpty(value.stimulus)) issues.push({ path: path + ".stimulus", message: "Stimulus is required." });
    if (!isRecord(value.amount)) {
      issues.push({ path: path + ".amount", message: "A typed growth amount is required." });
    } else if (value.amount.kind === "relative_change") {
      if (!finite(value.amount.fraction) || value.amount.fraction < 0) {
        issues.push({ path: path + ".amount.fraction", message: "Must be a finite, non-negative fraction." });
      }
    } else if (value.amount.kind === "absolute_target") {
      if (!finite(value.amount.scale) || value.amount.scale <= 0) {
        issues.push({ path: path + ".amount.scale", message: "Must be finite and greater than zero." });
      }
    } else {
      issues.push({ path: path + ".amount.kind", message: "2D sprite experiments support relative_change and absolute_target only." });
    }
    if (value.requestedDurationSeconds !== undefined &&
        (!finite(value.requestedDurationSeconds) || value.requestedDurationSeconds < 0)) {
      issues.push({ path: path + ".requestedDurationSeconds", message: "Must be finite and non-negative seconds." });
    }
  } else if (value.kind === "flow") {
    if (!finite(value.flowMultiplier) || value.flowMultiplier < 0) {
      issues.push({ path: path + ".flowMultiplier", message: "Must be finite and non-negative." });
    }
    if (!finite(value.supplySeconds) || value.supplySeconds < 0) {
      issues.push({ path: path + ".supplySeconds", message: "Must be finite and non-negative seconds." });
    }
  } else if (value.kind === "hold") {
    if (typeof value.active !== "boolean") {
      issues.push({ path: path + ".active", message: "Must be boolean." });
    }
  } else {
    issues.push({ path: path + ".kind", message: "Unsupported growth command kind." });
  }

  if (value.parameters !== undefined) {
    if (!isRecord(value.parameters) || Object.values(value.parameters).some(item =>
      typeof item !== "number" && typeof item !== "string" && typeof item !== "boolean")) {
      issues.push({ path: path + ".parameters", message: "Parameters must contain only numbers, strings, or booleans." });
    }
  }
  return issues;
}

export function validateTwoDimensionalSpriteExperimentConfig(
  value: unknown,
): SpriteExperimentValidationResult {
  const issues: SpriteExperimentValidationIssue[] = [];
  if (!isRecord(value)) {
    return { valid: false, issues: [{ path: "$", message: "Experiment configuration must be a JSON object." }] };
  }
  if (value.schemaVersion !== TWO_D_SPRITE_EXPERIMENT_SCHEMA_VERSION) {
    issues.push({ path: "schemaVersion", message: "Unsupported 2D sprite experiment schema version." });
  }
  if (!nonEmpty(value.experimentId)) issues.push({ path: "experimentId", message: "Experiment ID is required." });
  if (!nonEmpty(value.configurationVersion)) issues.push({ path: "configurationVersion", message: "Configuration version is required." });
  if (!finite(value.durationSeconds) || value.durationSeconds <= 0) {
    issues.push({ path: "durationSeconds", message: "Must be finite and greater than zero seconds." });
  }
  if (!finite(value.timestepSeconds) || value.timestepSeconds <= 0) {
    issues.push({ path: "timestepSeconds", message: "Must be finite and greater than zero seconds." });
  }
  if (isRecord(value.subject)) {
    for (const key of ["subjectId", "assetId", "assetKind", "worldUnit"] as const) {
      if (!nonEmpty(value.subject[key])) issues.push({ path: "subject." + key, message: "A non-empty value is required." });
    }
    if (!isRecord(value.subject.initialDimensions) ||
        !finite(value.subject.initialDimensions.x) || value.subject.initialDimensions.x <= 0 ||
        !finite(value.subject.initialDimensions.y) || value.subject.initialDimensions.y <= 0 ||
        !finite(value.subject.initialDimensions.z) || value.subject.initialDimensions.z < 0) {
      issues.push({ path: "subject.initialDimensions", message: "Sprite dimensions require positive X/Y and non-negative Z values." });
    }
  } else {
    issues.push({ path: "subject", message: "Subject metadata is required." });
  }

  if (!Array.isArray(value.events)) {
    issues.push({ path: "events", message: "Events must be an array." });
  } else {
    let previousTime = -1;
    value.events.forEach((event, index) => {
      const path = "events[" + index + "]";
      if (!isRecord(event)) {
        issues.push({ path, message: "Event must be an object." });
        return;
      }
      if (!finite(event.atSeconds) || event.atSeconds < 0 ||
          (finite(value.durationSeconds) && event.atSeconds > value.durationSeconds)) {
        issues.push({ path: path + ".atSeconds", message: "Event time must be within the experiment duration." });
      } else if (event.atSeconds < previousTime) {
        issues.push({ path: path + ".atSeconds", message: "Events must be ordered by non-decreasing simulation time." });
      } else {
        previousTime = event.atSeconds;
      }
      if (!isRecord(event.action)) {
        issues.push({ path: path + ".action", message: "Event action is required." });
      } else if (event.action.kind === "growth") {
        issues.push(...validateGrowthCommand(event.action.command, path + ".action.command"));
      } else if (event.action.kind === "breathing") {
        if (typeof event.action.active !== "boolean") {
          issues.push({ path: path + ".action.active", message: "Breathing active must be boolean." });
        }
      } else {
        issues.push({ path: path + ".action.kind", message: "Unsupported event action." });
      }
    });
  }

  if (value.biologicalBreathing !== undefined) {
    if (!isRecord(value.biologicalBreathing) || typeof value.biologicalBreathing.enabled !== "boolean") {
      issues.push({ path: "biologicalBreathing", message: "Breathing configuration requires an enabled boolean." });
    } else if (value.biologicalBreathing.profile !== undefined) {
      if (!isRecord(value.biologicalBreathing.profile)) {
        issues.push({ path: "biologicalBreathing.profile", message: "Breathing profile must be an object." });
      } else {
        try {
          new BiologicalBreathController(value.biologicalBreathing.profile as Partial<BiologicalBreathConfig>);
        } catch (error) {
          issues.push({
            path: "biologicalBreathing.profile",
            message: error instanceof Error ? error.message : "Invalid breathing profile.",
          });
        }
      }
    }
  }

  return issues.length === 0 ? { valid: true, issues: [] } : { valid: false, issues };
}

export function parseTwoDimensionalSpriteExperimentConfig(
  json: string,
): TwoDimensionalSpriteExperimentConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    throw new SyntaxError("Invalid experiment JSON: " +
      (error instanceof Error ? error.message : String(error)));
  }
  const validation = validateTwoDimensionalSpriteExperimentConfig(parsed);
  if (!validation.valid) {
    throw new Error("Invalid 2D sprite experiment configuration: " +
      validation.issues.map(issue => issue.path + ": " + issue.message).join("; "));
  }
  return parsed as TwoDimensionalSpriteExperimentConfig;
}

/**
 * Deterministic, fixed-step runner for a caller-provided 2D sprite growth model.
 * It owns scheduling, not the Sprite, material, texture, renderer, or storage.
 */
export class TwoDimensionalSpriteExperimentRunner {
  private readonly model: GrowthModel;
  private readonly config: TwoDimensionalSpriteExperimentConfig;
  private readonly context: GrowthModelContext;
  private initialized = false;
  private completed = false;
  private currentTimeSeconds = 0;
  private nextEventIndex = 0;
  private readonly samples: TwoDimensionalSpriteExperimentSample[] = [];
  private readonly commandResults: GrowthModelResult[] = [];

  constructor(model: GrowthModel, config: TwoDimensionalSpriteExperimentConfig) {
    const validation = validateTwoDimensionalSpriteExperimentConfig(config);
    if (!validation.valid) {
      throw new Error("Invalid 2D sprite experiment configuration: " +
        validation.issues.map(issue => issue.path + ": " + issue.message).join("; "));
    }
    if (!model.descriptor.capabilities.supportedAssetKinds.includes(config.subject.assetKind)) {
      throw new Error("Growth model does not support asset kind: " + config.subject.assetKind);
    }
    this.config = config;
    this.model = config.biologicalBreathing?.enabled
      ? new BiologicalBreathingGrowthModel(model, config.biologicalBreathing.profile)
      : model;
    this.context = {
      experimentId: config.experimentId,
      simulationTimeSeconds: 0,
      configurationVersion: config.configurationVersion,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) throw new Error("Experiment runner has already been initialized.");
    await this.model.initialize(this.config.subject, this.context);
    this.initialized = true;
    this.capture();
    await this.executeEventsAtCurrentTime();
  }

  async run(): Promise<TwoDimensionalSpriteExperimentResult> {
    if (!this.initialized) throw new Error("Initialize the experiment runner before running it.");
    if (this.completed) throw new Error("This experiment runner has already completed.");

    const endTime = this.config.durationSeconds;
    const epsilon = 1e-10;
    while (this.currentTimeSeconds + epsilon < endTime) {
      const nextEvent = this.config.events[this.nextEventIndex];
      const nextEventTime = nextEvent?.atSeconds ?? Number.POSITIVE_INFINITY;
      if (nextEventTime <= this.currentTimeSeconds + epsilon) {
        await this.executeEventsAtCurrentTime();
        continue;
      }

      const step = Math.min(
        this.config.timestepSeconds,
        endTime - this.currentTimeSeconds,
        nextEventTime - this.currentTimeSeconds,
      );
      if (step <= epsilon) {
        await this.executeEventsAtCurrentTime();
        continue;
      }
      this.currentTimeSeconds += step;
      this.model.advance(this.currentTimeSeconds, step);
      this.capture();
      await this.executeEventsAtCurrentTime();
    }
    await this.executeEventsAtCurrentTime();

    this.completed = true;
    return {
      experimentId: this.config.experimentId,
      configurationVersion: this.config.configurationVersion,
      modelId: this.model.descriptor.id,
      startedAtSeconds: 0,
      endedAtSeconds: this.currentTimeSeconds,
      samples: [...this.samples],
      commandResults: [...this.commandResults],
    };
  }

  dispose(): void {
    this.model.dispose();
  }

  private async executeEventsAtCurrentTime(): Promise<void> {
    const epsilon = 1e-10;
    while (this.nextEventIndex < this.config.events.length) {
      const event = this.config.events[this.nextEventIndex];
      if (event.atSeconds > this.currentTimeSeconds + epsilon) break;
      this.nextEventIndex += 1;
      if (event.action.kind === "breathing") {
        if (!(this.model instanceof BiologicalBreathingGrowthModel)) {
          throw new Error("Breathing events require biologicalBreathing.enabled in the experiment config.");
        }
        if (event.action.active) this.model.startBreathing();
        else this.model.stopBreathing();
      } else {
        const result = await this.model.apply(event.action.command, {
          ...this.context,
          simulationTimeSeconds: this.currentTimeSeconds,
        });
        this.commandResults.push(result);
      }
      this.capture();
    }
  }

  private capture(): void {
    this.samples.push({
      simulationTimeSeconds: this.currentTimeSeconds,
      telemetry: this.model.readTelemetry(this.currentTimeSeconds),
    });
  }
}
