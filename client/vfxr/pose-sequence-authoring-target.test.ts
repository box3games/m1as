import assert from "node:assert/strict";
import testCase from "node:test";
import { VfxrPoseSequenceAuthoringTarget } from "./pose-sequence-authoring-target.js";
import { VfxrPoseTransitionAdapter } from "../evaluation/character-pose-transition-adapters.js";
import type { CharacterPoseTransition } from "../evaluation/character-pose-transition-contract.js";

const transition:CharacterPoseTransition={transitionId:"vfxr-squat-sequence",subjectId:"sprite-hero",durationSeconds:2,supportedRepresentations:["2d","2.5d","3d"],configurationVersion:"cfg-vfxr",growthStateId:"growth-3",keyframes:[
{timeSeconds:0,poseKind:"neutral-standing",envelope:{width:0.6,height:1.8,depth:0.35},jointTargets:[{jointId:"Spine",channel:"rotation-x",value:0,unit:"radians"}],envelopeInterpolation:"linear",jointInterpolation:"linear"},
{timeSeconds:2,poseKind:"compressed-squat",envelope:{width:0.9,height:0.72,depth:0.5},jointTargets:[{jointId:"Spine",channel:"rotation-x",value:0.8,unit:"radians"}],envelopeInterpolation:"smoothstep",jointInterpolation:"ease-in"}
]};
testCase("VFXR adapter records ordered 2D authoring frames with normalized envelope",async()=>{
 const target=new VfxrPoseSequenceAuthoringTarget({targetId:"vfxr.sprite.authoring",supportedPoseKinds:["neutral-standing","compressed-squat"]});
 const adapter=new VfxrPoseTransitionAdapter(target);
 await adapter.dispatch(transition,2);await adapter.dispatch(transition,0);
 const doc=target.getDocument(transition.transitionId)!;
 assert.equal(doc.frames.length,2);assert.equal(doc.frames[0].elapsedSeconds,0);assert.equal(doc.frames[1].elapsedSeconds,2);
 assert.equal(doc.frames[1].projectedEnvelopeRatio.height,0.4);
 assert.equal(doc.frames[1].depthSourceMetadataMeters,0.5);
 assert.equal(doc.rendering.animationRendered,false);
});
testCase("VFXR authoring rejects unsupported poses and mismatched provenance",()=>{
 const target=new VfxrPoseSequenceAuthoringTarget({targetId:"vfxr",supportedPoseKinds:["neutral-standing"]});
 assert.equal(target.supportsTransition(transition).supported,false);
 const sample:any={schemaVersion:"big3r-character-pose-transition/1.0",transitionId:"t",subjectId:"s",elapsedSeconds:0,normalizedProgress:0,poseKind:"neutral-standing",envelope:{width:1,height:2,depth:1},jointTargets:[],supportedRepresentations:["2d"],configurationVersion:"cfg",growthStateId:"g",authority:{actualGrowthScaleModified:false,skeletonTransformsApplied:false,spriteTransformsApplied:false,animationRendered:false}};
 assert.equal(target.submitTransitionSample(sample).accepted,true);
 assert.equal(target.submitTransitionSample({...sample,growthStateId:"other",elapsedSeconds:1}).accepted,false);
});
testCase("VFXR authoring is idempotent and rejects conflicting samples at same time",()=>{
 const target=new VfxrPoseSequenceAuthoringTarget({targetId:"vfxr",supportedPoseKinds:["neutral-standing"]});
 const sample:any={schemaVersion:"big3r-character-pose-transition/1.0",transitionId:"t",subjectId:"s",elapsedSeconds:0,normalizedProgress:0,poseKind:"neutral-standing",envelope:{width:1,height:2,depth:1},jointTargets:[],supportedRepresentations:["2d"],configurationVersion:"cfg",growthStateId:"g",authority:{actualGrowthScaleModified:false,skeletonTransformsApplied:false,spriteTransformsApplied:false,animationRendered:false}};
 assert.equal(target.submitTransitionSample(sample).accepted,true);
 assert.equal(target.submitTransitionSample(sample).telemetry?.duplicateSampleSuppressed,true);
 assert.equal(target.submitTransitionSample({...sample,envelope:{width:2,height:2,depth:1}}).accepted,false);
});
testCase("VFXR authoring returns defensive document copies and supports clear",()=>{
 const target=new VfxrPoseSequenceAuthoringTarget({targetId:"vfxr",supportedPoseKinds:["neutral-standing"]});
 const sample:any={schemaVersion:"big3r-character-pose-transition/1.0",transitionId:"t",subjectId:"s",elapsedSeconds:0,normalizedProgress:0,poseKind:"neutral-standing",envelope:{width:1,height:2,depth:1},jointTargets:[],supportedRepresentations:["2d"],configurationVersion:"cfg",growthStateId:"g",authority:{actualGrowthScaleModified:false,skeletonTransformsApplied:false,spriteTransformsApplied:false,animationRendered:false}};
 target.submitTransitionSample(sample);const doc=target.getDocument("t")!;doc.frames[0].envelopeMeters.width=99;
 assert.equal(target.getDocument("t")!.frames[0].envelopeMeters.width,1);assert.equal(target.clearDocument("t"),true);assert.equal(target.getDocument("t"),undefined);
});
