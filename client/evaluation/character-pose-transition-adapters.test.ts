import assert from "node:assert/strict";
import testCase from "node:test";
import { Big3rPoseTransitionAdapter, VfxrPoseTransitionAdapter } from "./character-pose-transition-adapters.js";
import type { CharacterPoseTransition } from "./character-pose-transition-contract.js";
const transition:CharacterPoseTransition={transitionId:"same-transition",subjectId:"hero",durationSeconds:2,supportedRepresentations:["2d","3d"],configurationVersion:"cfg",growthStateId:"growth",keyframes:[
{timeSeconds:0,poseKind:"neutral-standing",envelope:{width:1,height:2,depth:1},jointTargets:[{jointId:"Spine",channel:"rotation-x",value:0,unit:"radians"}],envelopeInterpolation:"linear",jointInterpolation:"linear"},
{timeSeconds:2,poseKind:"compressed-squat",envelope:{width:1.2,height:1,depth:1.1},jointTargets:[{jointId:"Spine",channel:"rotation-x",value:0.8,unit:"radians"}],envelopeInterpolation:"smoothstep",jointInterpolation:"ease-in"}
]};
testCase("dispatches the same timed sample to BIG3R and VFXR",async()=>{
 const bigSamples:any[]=[];const vfxSamples:any[]=[];
 const big=new Big3rPoseTransitionAdapter({targetId:"rig-target",rigId:"rig-1",supportsTransition:()=>({supported:true}),submitTransitionSample:s=>{bigSamples.push(s);return {accepted:true};}},"rig-1");
 const vfx=new VfxrPoseTransitionAdapter({targetId:"vfx-target",supportsTransition:()=>({supported:true}),submitTransitionSample:s=>{vfxSamples.push(s);return {accepted:true};}});
 const [b,v]=await Promise.all([big.dispatch(transition,1),vfx.dispatch(transition,1)]);
 assert.equal(b.accepted,true);assert.equal(v.accepted,true);
 assert.equal(bigSamples[0].transitionId,vfxSamples[0].transitionId);
 assert.equal(bigSamples[0].elapsedSeconds,vfxSamples[0].elapsedSeconds);
 assert.deepEqual(bigSamples[0].envelope,vfxSamples[0].envelope);
 assert.deepEqual(bigSamples[0].jointTargets,vfxSamples[0].jointTargets);
});
testCase("rejects representation mismatch without fallback",async()=>{
 const adapter=new VfxrPoseTransitionAdapter({targetId:"vfx",supportsTransition:()=>({supported:true}),submitTransitionSample:()=>({accepted:true})});
 const result=await adapter.dispatch({...transition,supportedRepresentations:["3d"]},1);
 assert.equal(result.status,"unsupported");
});
testCase("rejects BIG3R target whose rig identity differs",async()=>{
 const adapter=new Big3rPoseTransitionAdapter({targetId:"rig",rigId:"other",supportsTransition:()=>({supported:true}),submitTransitionSample:()=>({accepted:true})},"expected");
 const result=await adapter.dispatch(transition,1);
 assert.equal(result.status,"unsupported");
});
testCase("does not dispatch when target rejects a transition capability",async()=>{
 const adapter=new VfxrPoseTransitionAdapter({targetId:"vfx",supportsTransition:()=>({supported:false,reason:"pose unsupported"}),submitTransitionSample:()=>({accepted:true})});
 const result=await adapter.dispatch(transition,1);
 assert.equal(result.status,"unsupported");assert.equal(result.reason,"pose unsupported");
});
