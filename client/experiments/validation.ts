import type {
  CaptureProfile, ExperimentManifest, GrowthOutcome, GrowthRequestRecord,
  NormalizedRect, SweetSpotRecipe,
} from './contracts.js';

export interface ValidationIssue { path: string; message: string }
export type ValidationResult =
  | { valid: true; issues: [] }
  | { valid: false; issues: ValidationIssue[] };

const finite = (value: number): boolean => Number.isFinite(value);
const nonEmpty = (value: string): boolean => value.trim().length > 0;

export function validateNormalizedRect(rect: NormalizedRect): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (!finite(rect[key])) issues.push({ path: key, message: 'Must be finite.' });
    else if (rect[key] < 0 || rect[key] > 1) issues.push({ path: key, message: 'Must be within [0, 1].' });
  }
  if (finite(rect.x) && finite(rect.width) && rect.x + rect.width > 1.000001) issues.push({ path: 'width', message: 'Bounds extend past the right viewport edge.' });
  if (finite(rect.y) && finite(rect.height) && rect.y + rect.height > 1.000001) issues.push({ path: 'height', message: 'Bounds extend past the bottom viewport edge.' });
  return issues;
}

export function validateGrowthOutcome(outcome: GrowthOutcome): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(outcome.components) || outcome.components.length === 0) {
    issues.push({ path: 'components', message: 'At least one growth component is required.' });
  } else outcome.components.forEach((component, index) => {
    const path = 'components[' + index + ']';
    switch (component.kind) {
      case 'relative_change':
        if (!finite(component.changeFraction) || component.changeFraction < 0) issues.push({ path: path + '.changeFraction', message: 'Must be a finite, non-negative fraction.' });
        break;
      case 'absolute_target':
        if (!finite(component.targetScale) || component.targetScale <= 0) issues.push({ path: path + '.targetScale', message: 'Target scale must be finite and greater than zero.' });
        break;
      case 'regional_growth':
        if (!nonEmpty(component.regionId)) issues.push({ path: path + '.regionId', message: 'Region ID is required.' });
        if (component.amount.kind === 'relative_change' &&
            (!finite(component.amount.changeFraction) || component.amount.changeFraction < 0)) {
          issues.push({ path: path + '.amount.changeFraction', message: 'Must be a finite, non-negative fraction.' });
        }
        if (component.amount.kind === 'absolute_target' &&
            (!finite(component.amount.targetScale) || component.amount.targetScale <= 0)) {
          issues.push({ path: path + '.amount.targetScale', message: 'Target scale must be finite and greater than zero.' });
        }
        break;
      case 'authored_profile':
        if (!nonEmpty(component.profileId)) issues.push({ path: path + '.profileId', message: 'Profile ID is required.' });
        if (!nonEmpty(component.profileVersion)) issues.push({ path: path + '.profileVersion', message: 'Profile version is required.' });
        break;
      default: {
        const exhaustive: never = component;
        issues.push({ path, message: 'Unsupported component: ' + String(exhaustive) });
      }
    }
  });
  if (outcome.minimumScale !== undefined && (!finite(outcome.minimumScale) || outcome.minimumScale <= 0)) issues.push({ path: 'minimumScale', message: 'Must be finite and greater than zero.' });
  if (outcome.maximumScale !== undefined && (!finite(outcome.maximumScale) || outcome.maximumScale <= 0)) issues.push({ path: 'maximumScale', message: 'Must be finite and greater than zero.' });
  if (outcome.minimumScale !== undefined && outcome.maximumScale !== undefined && outcome.minimumScale > outcome.maximumScale) issues.push({ path: 'maximumScale', message: 'Must not be below minimumScale.' });
  if (outcome.durationSeconds !== undefined && (!finite(outcome.durationSeconds) || outcome.durationSeconds < 0)) issues.push({ path: 'durationSeconds', message: 'Must be finite and non-negative seconds.' });
  return issues;
}

export function validateGrowthRequest(request: GrowthRequestRecord): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (request.mode === 'outcome') {
    if (!request.requestedOutcome) issues.push({ path: 'requestedOutcome', message: 'Outcome-mode requests require an explicit outcome.' });
    else issues.push(...validateGrowthOutcome(request.requestedOutcome).map(issue => ({ ...issue, path: 'requestedOutcome.' + issue.path })));
    if (request.opportunity) issues.push({ path: 'opportunity', message: 'Outcome-mode requests must not also carry an opportunity.' });
  } else {
    if (!request.opportunity || !nonEmpty(request.opportunity.opportunityType)) issues.push({ path: 'opportunity', message: 'Opportunity-mode requests require a typed opportunity.' });
    if (request.requestedOutcome) issues.push({ path: 'requestedOutcome', message: 'Opportunity-mode requests must not masquerade as outcome requests; use suggestedOutcome on the opportunity.' });
    if (request.opportunity?.suggestedOutcome) issues.push(...validateGrowthOutcome(request.opportunity.suggestedOutcome).map(issue => ({ ...issue, path: 'opportunity.suggestedOutcome.' + issue.path })));
  }
  if (!nonEmpty(request.requestId)) issues.push({ path: 'requestId', message: 'Request ID is required.' });
  if (!nonEmpty(request.experimentId)) issues.push({ path: 'experimentId', message: 'Experiment ID is required.' });
  if (!nonEmpty(request.source)) issues.push({ path: 'source', message: 'Request source is required.' });
  if (!finite(request.time.simulationTimeSeconds) || request.time.simulationTimeSeconds < 0) issues.push({ path: 'time.simulationTimeSeconds', message: 'Must be finite and non-negative.' });
  if (!Number.isInteger(request.time.sequenceNumber) || request.time.sequenceNumber < 0) issues.push({ path: 'time.sequenceNumber', message: 'Must be a non-negative integer.' });
  return issues;
}

export function validateCaptureProfile(profile: CaptureProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const key of ['preEventWindowSeconds', 'postEventWindowSeconds'] as const) {
    if (!finite(profile[key]) || profile[key] < 0) issues.push({ path: key, message: 'Must be finite and non-negative seconds.' });
  }
  if (profile.mode === 'continuous' && profile.sampleIntervalSeconds !== undefined &&
      (!finite(profile.sampleIntervalSeconds) || profile.sampleIntervalSeconds <= 0)) {
    issues.push({ path: 'sampleIntervalSeconds', message: 'Must be finite and greater than zero seconds.' });
  }
  if (profile.mode === 'continuous' && profile.sampleIntervalSeconds === undefined && profile.frameInterval === undefined) {
    issues.push({ path: 'sampleIntervalSeconds', message: 'Continuous capture requires a time or frame interval.' });
  }
  if (profile.sampleIntervalSeconds !== undefined && (!finite(profile.sampleIntervalSeconds) || profile.sampleIntervalSeconds <= 0)) {
    issues.push({ path: 'sampleIntervalSeconds', message: 'Must be finite and greater than zero seconds.' });
  }
  if (profile.frameInterval !== undefined && (!Number.isInteger(profile.frameInterval) || profile.frameInterval <= 0)) {
    issues.push({ path: 'frameInterval', message: 'Must be a positive integer.' });
  }
  return issues;
}

export function validateExperimentManifest(manifest: ExperimentManifest): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (manifest.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: 'Unsupported experiment schema version.' });
  if (!nonEmpty(manifest.experimentId)) issues.push({ path: 'experimentId', message: 'Experiment ID is required.' });
  if (!nonEmpty(manifest.title)) issues.push({ path: 'title', message: 'Title is required.' });
  if (!nonEmpty(manifest.createdAtISO) || Number.isNaN(Date.parse(manifest.createdAtISO))) issues.push({ path: 'createdAtISO', message: 'Must be a valid ISO date-time.' });
  if (!nonEmpty(manifest.worldUnit)) issues.push({ path: 'worldUnit', message: 'World unit must be declared by the test bed.' });
  if (manifest.screenCoordinateConvention !== 'normalized_top_left_origin') issues.push({ path: 'screenCoordinateConvention', message: 'Screen coordinates must be normalized with a top-left origin.' });
  if (!nonEmpty(manifest.buildVersion)) issues.push({ path: 'buildVersion', message: 'Build version is required.' });
  if (!nonEmpty(manifest.configurationVersion)) issues.push({ path: 'configurationVersion', message: 'Configuration version is required.' });
  issues.push(...validateCaptureProfile(manifest.captureProfile).map(issue => ({ ...issue, path: 'captureProfile.' + issue.path })));
  return issues.length === 0 ? { valid: true, issues: [] } : { valid: false, issues };
}

export function validateSweetSpotRecipe(recipe: SweetSpotRecipe): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!nonEmpty(recipe.sweetSpotId)) issues.push({ path: 'sweetSpotId', message: 'Sweet-spot ID is required.' });
  if (!nonEmpty(recipe.name)) issues.push({ path: 'name', message: 'Name is required.' });
  if (!nonEmpty(recipe.version)) issues.push({ path: 'version', message: 'Version is required.' });
  if (!nonEmpty(recipe.intendedEffect)) issues.push({ path: 'intendedEffect', message: 'Intended effect is required.' });
  const names = new Set<string>();
  recipe.parameters.forEach((parameter, index) => {
    const path = 'parameters[' + index + ']';
    if (!nonEmpty(parameter.parameterId)) issues.push({ path: path + '.parameterId', message: 'Parameter ID is required.' });
    if (names.has(parameter.parameterId)) issues.push({ path: path + '.parameterId', message: 'Parameter IDs must be unique.' });
    names.add(parameter.parameterId);
    if (parameter.minimum !== undefined && !finite(parameter.minimum)) issues.push({ path: path + '.minimum', message: 'Minimum must be finite.' });
    if (parameter.maximum !== undefined && !finite(parameter.maximum)) issues.push({ path: path + '.maximum', message: 'Maximum must be finite.' });
    if (parameter.minimum !== undefined && parameter.maximum !== undefined && parameter.minimum > parameter.maximum) issues.push({ path, message: 'Minimum cannot exceed maximum.' });
  });
  return issues.length === 0 ? { valid: true, issues: [] } : { valid: false, issues };
}
