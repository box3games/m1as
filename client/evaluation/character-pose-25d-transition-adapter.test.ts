import assert from "node:assert/strict";
import testCase from "node:test";
import { Plane25DPoseTransitionAdapter } from "./character-pose-25d-transition-adapter.js";
import type { CharacterPoseTransition } from "./character-pose-transition-contract.js";
const transition:CharacterPoseTransition={transitionId:"pose-parity-01",subjectId:"hero",durationSeconds:2,supportedRepresentations:["2d","2.5d","3d"],configurationVersion:"parity-cfg",growthStateId:"growth-01",keyframes:[
{timeSeconds:0,poseKind:"neutral-standing",envelope:{width:0.6,height:1.8,depth:0.35},jointTargets:[{jointId:"Spine",channel:"rotation-x",value:0,unit:"radians"}],envelopeInterpolation:"linear",jointInterpolation:"linear"},
{timeSeconds:2,poseKind:"compressed-squat",envelope:{width:0.9,height:0.72,depth:0.5},jointTargets:[{jointId:"Spine",channel:"rotation-x",value:0.8,unit:"radians"}],envelopeInterpolation:"smoothstep",jointInterpolation:"ease-in"}
]};
testCase("dispatches same shared sample and preserves 2.5D depth",async()=>{let captured:any;const a=new Plane25DPoseTransitionAdapter({targetId:"plane-target",planeRigId:"plane-1",supportsJointTarget:()=>true,submitPoseSample:s=>{captured=s;return {accepted:true};}},"plane-1");const r=await a.dispatch(transition,1);assert.equal(r.accepted,true);assert.equal(r.depthMeters,captured.envelope.depth);assert.equal(captured.transitionId,transition.transitionId);});
testCase("rejects unsupported representation and mismatched plane rig",async()=>{const target={targetId:"p",planeRigId:"wrong",supportsJointTarget:()=>true,submitPoseSample:()=>({accepted:true})};const a=new Plane25DPoseTransitionAdapter(target,"expected");assert.equal((await a.dispatch({...transition,supportedRepresentations:["2d"]},1)).status,"unsupported");assert.equal((await a.dispatch(transition,1)).status,"unsupported");});
testCase("rejects unsupported joint channels without fallback",async()=>{const a=new Plane25DPoseTransitionAdapter({targetId:"p",planeRigId:"plane-1",supportsJointTarget:()=>false,submitPoseSample:()=>({accepted:true})},"plane-1");const r=await a.dispatch(transition,1);assert.equal(r.status,"unsupported");});
