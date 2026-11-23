import type { CharacterPoseTransition, CharacterPoseTransitionSample } from "./character-pose-transition-contract.js";
import { sampleCharacterPoseTransition } from "./character-pose-transition-contract.js";

export interface PoseTransitionTargetResult {
  accepted: boolean;
  reason?: string;
  telemetry?: Record<string, string | number | boolean>;
}
export interface Big3rPoseTransitionTarget {
  targetId: string;
  rigId: string;
  supportsTransition(transition: CharacterPoseTransition): { supported: boolean; reason?: string };
  submitTransitionSample(sample: CharacterPoseTransitionSample): Promise<PoseTransitionTargetResult> | PoseTransitionTargetResult;
}
export interface VfxrPoseTransitionTarget {
  targetId: string;
  supportsTransition(transition: CharacterPoseTransition): { supported: boolean; reason?: string };
  submitTransitionSample(sample: CharacterPoseTransitionSample): Promise<PoseTransitionTargetResult> | PoseTransitionTargetResult;
}
export interface PoseTransitionDispatchResult {
  accepted: boolean;
  status: "dispatched" | "unsupported" | "rejected";
  pipeline: "BIG3R" | "VFXR";
  targetId: string;
  transitionId: string;
  subjectId: string;
  elapsedSeconds: number;
  normalizedProgress: number;
  reason?: string;
  telemetry?: Record<string, string | number | boolean>;
}
function makeResult(pipeline:"BIG3R"|"VFXR",targetId:string,sample:CharacterPoseTransitionSample,accepted:boolean,reason?:string,telemetry?:Record<string,string|number|boolean>):PoseTransitionDispatchResult {
 return {accepted,status:accepted?"dispatched":"rejected",pipeline,targetId,transitionId:sample.transitionId,subjectId:sample.subjectId,elapsedSeconds:sample.elapsedSeconds,normalizedProgress:sample.normalizedProgress,...(reason?{reason}:{}),...(telemetry?{telemetry}:{})};
}
/** Samples and dispatches a shared transition to a registered BIG3R rig evaluator. */
export class Big3rPoseTransitionAdapter {
 constructor(private readonly target:Big3rPoseTransitionTarget,private readonly discoveredRigId:string) {}
 async dispatch(transition:CharacterPoseTransition,elapsedSeconds:number):Promise<PoseTransitionDispatchResult> {
  const sample=sampleCharacterPoseTransition(transition,elapsedSeconds);
  if(!transition.supportedRepresentations.includes("3d")) return {...makeResult("BIG3R",this.target.targetId,sample,false,"Transition does not declare 3D support."),status:"unsupported"};
  if(this.target.rigId!==this.discoveredRigId) return {...makeResult("BIG3R",this.target.targetId,sample,false,"Registered target rig does not match discovered rig."),status:"unsupported"};
  const capability=this.target.supportsTransition(transition);
  if(!capability.supported) return {...makeResult("BIG3R",this.target.targetId,sample,false,capability.reason??"BIG3R target does not support this transition."),status:"unsupported"};
  const result=await this.target.submitTransitionSample(sample);
  return makeResult("BIG3R",this.target.targetId,sample,result.accepted,result.reason,result.telemetry);
 }
}
/** Samples and dispatches the same transition to a VFXR 2D authoring target. */
export class VfxrPoseTransitionAdapter {
 constructor(private readonly target:VfxrPoseTransitionTarget) {}
 async dispatch(transition:CharacterPoseTransition,elapsedSeconds:number):Promise<PoseTransitionDispatchResult> {
  const sample=sampleCharacterPoseTransition(transition,elapsedSeconds);
  if(!transition.supportedRepresentations.includes("2d")) return {...makeResult("VFXR",this.target.targetId,sample,false,"Transition does not declare 2D support."),status:"unsupported"};
  const capability=this.target.supportsTransition(transition);
  if(!capability.supported) return {...makeResult("VFXR",this.target.targetId,sample,false,capability.reason??"VFXR target does not support this transition."),status:"unsupported"};
  const result=await this.target.submitTransitionSample(sample);
  return makeResult("VFXR",this.target.targetId,sample,result.accepted,result.reason,result.telemetry);
 }
}
