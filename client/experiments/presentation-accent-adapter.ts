import type {
  PresentationAccentEvaluation,
  PresentationAccentChannelValue,
} from "../growth/experiential-scale.js";

export type PresentationAccentApplyResult =
  | { status: "available"; value: number; hostId: string; provenance: string }
  | { status: "unsupported" | "failed"; reason: string };

export interface PresentationAccentEffectHost {
  readonly presentationAccentHostId: string;
  applyPresentationAccent(channelId: string, target: string, value: number): PresentationAccentApplyResult;
  clearPresentationAccentChannels(activeChannelIds: readonly string[]): void;
}

/** Applies only explicitly targeted channels and records the host's actual response. */
export function applyPresentationAccentEvaluation(
  evaluation: PresentationAccentEvaluation,
  host: PresentationAccentEffectHost,
): PresentationAccentEvaluation {
  const activeChannelIds = evaluation.channels
    .filter(channel => channel.effectTarget)
    .map(channel => channel.channelId);
  host.clearPresentationAccentChannels(activeChannelIds);
  const channels: PresentationAccentChannelValue[] = evaluation.channels.map(channel => {
    if (!channel.effectTarget) {
      return {
        ...channel,
        appliedValue: {
          status: "not_captured",
          reason: "No effectTarget is configured for this accent channel.",
        },
      };
    }
    try {
      const result = host.applyPresentationAccent(
        channel.channelId, channel.effectTarget, channel.mappedTargetValue,
      );
      return {
        ...channel,
        appliedValue: result.status === "available"
          ? result
          : { status: result.status, reason: result.reason },
      };
    } catch (error) {
      return {
        ...channel,
        appliedValue: {
          status: "failed",
          reason: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });
  return { ...evaluation, channels };
}
