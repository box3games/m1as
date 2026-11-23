import type { CharacterDimensionsMeters, CharacterPoseJointTarget, CharacterPoseKind } from "./character-volume-pose-bridge-contract.js";

export const CHARACTER_POSE_TRANSITION_SCHEMA_VERSION = "big3r-character-pose-transition/1.0" as const;
export type PoseInterpolation = "linear" | "smoothstep" | "ease-in" | "ease-out";
export interface PoseTransitionKeyframe {
  timeSeconds: number;
  poseKind: CharacterPoseKind;
  envelope: CharacterDimensionsMeters;
  jointTargets: CharacterPoseJointTarget[];
  envelopeInterpolation: PoseInterpolation;
  jointInterpolation: PoseInterpolation;
}
export interface CharacterPoseTransition {
  transitionId: string;
  subjectId: string;
  durationSeconds: number;
  keyframes: PoseTransitionKeyframe[];
  supportedRepresentations: ("2d" | "2.5d" | "3d")[];
  configurationVersion: string;
  growthStateId: string;
}
export interface CharacterPoseTransitionSample {
  schemaVersion: typeof CHARACTER_POSE_TRANSITION_SCHEMA_VERSION;
  transitionId: string;
  subjectId: string;
  elapsedSeconds: number;
  durationSeconds: number;
  normalizedProgress: number;
  poseKind: CharacterPoseKind;
  envelope: CharacterDimensionsMeters;
  jointTargets: CharacterPoseJointTarget[];
  supportedRepresentations: CharacterPoseTransition["supportedRepresentations"];
  configurationVersion: string;
  growthStateId: string;
  authority: { actualGrowthScaleModified: false; skeletonTransformsApplied: false; spriteTransformsApplied: false; animationRendered: false };
}
const modes: readonly PoseInterpolation[] = ["linear","smoothstep","ease-in","ease-out"];
const poses: readonly CharacterPoseKind[] = ["neutral-standing","spine-hunch","compressed-squat","tucked-squat","deep-squat","seated-v","crawl","custom"];
const representations = ["2d","2.5d","3d"] as const;
const validNumber = (v:number) => Number.isFinite(v);
const nonEmpty = (v:string) => typeof v === "string" && v.trim().length > 0;
function validateEnvelope(e: CharacterDimensionsMeters): void {
  if (!e || !validNumber(e.width) || e.width <= 0 || !validNumber(e.height) || e.height <= 0 || !validNumber(e.depth) || e.depth <= 0) throw new RangeError("Transition envelope dimensions must be finite positive metres.");
}
function easing(t:number, mode:PoseInterpolation):number {
  if(mode==="smoothstep") return t*t*(3-2*t);
  if(mode==="ease-in") return t*t;
  if(mode==="ease-out") return 1-(1-t)*(1-t);
  return t;
}
function interpolate(a:number,b:number,t:number):number { return a+(b-a)*t; }
function validateJointTargets(targets:CharacterPoseJointTarget[]):void {
  const seen=new Set<string>();
  for(const target of targets){
    if(!nonEmpty(target.jointId)||!validNumber(target.value)||!["rotation-x","rotation-y","rotation-z","translation-x","translation-y","translation-z"].includes(target.channel)||!["radians","meters"].includes(target.unit)) throw new TypeError("Transition joint target is invalid.");
    const key=target.jointId+":"+target.channel;
    if(seen.has(key)) throw new TypeError("Transition contains duplicate joint target "+key+".");
    seen.add(key);
  }
}
export function validateCharacterPoseTransition(t:CharacterPoseTransition):void {
  if(!t||!nonEmpty(t.transitionId)||!nonEmpty(t.subjectId)||!validNumber(t.durationSeconds)||t.durationSeconds<=0||!nonEmpty(t.configurationVersion)||!nonEmpty(t.growthStateId)) throw new TypeError("Transition identity, duration and provenance are required.");
  if(!Array.isArray(t.keyframes)||t.keyframes.length<2||t.keyframes[0].timeSeconds!==0||t.keyframes[t.keyframes.length-1].timeSeconds!==t.durationSeconds) throw new TypeError("Transition requires at least two keyframes spanning its full duration.");
  if(!Array.isArray(t.supportedRepresentations)||!t.supportedRepresentations.length||t.supportedRepresentations.some(x=>!representations.includes(x))||new Set(t.supportedRepresentations).size!==t.supportedRepresentations.length) throw new TypeError("Transition representations must be unique and supported.");
  let previous=-1;
  for(const frame of t.keyframes){
    if(!validNumber(frame.timeSeconds)||frame.timeSeconds<=previous||frame.timeSeconds<0||frame.timeSeconds>t.durationSeconds) throw new RangeError("Keyframe times must be strictly increasing within transition duration.");
    if(!poses.includes(frame.poseKind)||!modes.includes(frame.envelopeInterpolation)||!modes.includes(frame.jointInterpolation)) throw new TypeError("Transition pose or interpolation mode is unsupported.");
    validateEnvelope(frame.envelope); validateJointTargets(frame.jointTargets); previous=frame.timeSeconds;
  }
  const keys=t.keyframes.map(f=>f.jointTargets.map(j=>j.jointId+":"+j.channel));
  const first=new Set(keys[0]);
  for(const set of keys.slice(1)) for(const key of set) if(!first.has(key)) throw new TypeError("Every keyframe must use the same joint target channels.");
}
export function sampleCharacterPoseTransition(t:CharacterPoseTransition, elapsedSeconds:number):CharacterPoseTransitionSample {
  validateCharacterPoseTransition(t);
  if(!validNumber(elapsedSeconds)||elapsedSeconds<0) throw new RangeError("Elapsed transition time must be finite and non-negative.");
  const elapsed=Math.min(elapsedSeconds,t.durationSeconds);
  let index=0;
  while(index<t.keyframes.length-2&&elapsed>t.keyframes[index+1].timeSeconds) index++;
  const a=t.keyframes[index], b=t.keyframes[index+1];
  const local=(elapsed-a.timeSeconds)/(b.timeSeconds-a.timeSeconds);
  const et=easing(local,a.envelopeInterpolation), jt=easing(local,a.jointInterpolation);
  const envelope={width:interpolate(a.envelope.width,b.envelope.width,et),height:interpolate(a.envelope.height,b.envelope.height,et),depth:interpolate(a.envelope.depth,b.envelope.depth,et)};
  const jointTargets=a.jointTargets.map((target,i)=>({...target,value:interpolate(target.value,b.jointTargets[i].value,jt)}));
  return {schemaVersion:CHARACTER_POSE_TRANSITION_SCHEMA_VERSION,transitionId:t.transitionId,subjectId:t.subjectId,elapsedSeconds:elapsed,durationSeconds:t.durationSeconds,normalizedProgress:elapsed/t.durationSeconds,poseKind:local<1?a.poseKind:b.poseKind,envelope,jointTargets,supportedRepresentations:[...t.supportedRepresentations],configurationVersion:t.configurationVersion,growthStateId:t.growthStateId,authority:{actualGrowthScaleModified:false,skeletonTransformsApplied:false,spriteTransformsApplied:false,animationRendered:false}};
}
