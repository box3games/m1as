import type { CaptureProfile, CaptureProfileName } from './contracts.js';

/** Starting configurations only; callers may compose or override capture modes. */
export const DEFAULT_CAPTURE_PROFILES: Readonly<Record<CaptureProfileName, CaptureProfile>> = {
  lightweight: {
    name: 'lightweight', mode: 'snapshot',
    eventTriggers: ['growth_queued', 'growth_started', 'growth_completed', 'camera_mode_changed', 'perception_annotation'],
    preEventWindowSeconds: 0.5, postEventWindowSeconds: 1,
    includeCamera: true, includeCharacter: true, includeWorldLandmarks: false,
    includeScreenSpace: true, includePerception: true,
  },
  detailed: {
    name: 'detailed', mode: 'continuous', sampleIntervalSeconds: 0.1,
    eventTriggers: ['growth_queued', 'growth_started', 'growth_completed', 'growth_velocity_changed', 'threshold_crossed',
      'camera_mode_changed', 'visibility_changed', 'environment_scale_transition', 'perception_annotation'],
    preEventWindowSeconds: 1, postEventWindowSeconds: 2,
    includeCamera: true, includeCharacter: true, includeWorldLandmarks: true,
    includeScreenSpace: true, includePerception: true,
  },
  discovery: {
    name: 'discovery', mode: 'continuous', sampleIntervalSeconds: 0.05,
    eventTriggers: ['growth_queued', 'growth_started', 'growth_completed', 'growth_velocity_changed', 'threshold_crossed',
      'camera_mode_changed', 'visibility_changed', 'environment_scale_transition', 'perception_annotation',
      'screen_occupancy_changed', 'unexpected_growth_continuation'],
    preEventWindowSeconds: 2, postEventWindowSeconds: 4,
    includeCamera: true, includeCharacter: true, includeWorldLandmarks: true,
    includeScreenSpace: true, includePerception: true,
  },
};
