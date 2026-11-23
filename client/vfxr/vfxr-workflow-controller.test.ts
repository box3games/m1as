import test from "node:test";
import assert from "node:assert/strict";
import { VfxrPoseSequenceAuthoringTarget } from "./pose-sequence-authoring-target.js";
import { VfxrPoseTransitionAdapter } from "../evaluation/character-pose-transition-adapters.js";
import type { CharacterPoseTransition } from "../evaluation/character-pose-transition-contract.js";

test("VFXR streamed workflow pose document retains the M1AS subject identity", async () => {
 const target = new VfxrPoseSequenceAuthoringTarget({targetId:"vfxr.workflow",supportedPoseKinds:["neutral-standing","compressed-squat"]});
 const adapter = new VfxrPoseTransitionAdapter(target);
 const transition:CharacterPoseTransition={transitionId:"streamed-asset-pose",subjectId:"m1as-asset:asset-xyz",durationSeconds:1,configurationVersion:"cfg",growthStateId:"g1",supportedRepresentations:["2d","2.5d","3d"],keyframes:[
  {timeSeconds:0,poseKind:"neutral-standing",envelope:{width:0.7,height:1.8,depth:0.3},jointTargets:[],envelopeInterpolation:"linear",jointInterpolation:"linear"},
  {timeSeconds:1,poseKind:"compressed-squat",envelope:{width:0.9,height:0.8,depth:0.4},jointTargets:[],envelopeInterpolation:"smoothstep",jointInterpolation:"smoothstep"}
 ]};
 await adapter.dispatch(transition,0);await adapter.dispatch(transition,1);
 const doc=target.getDocument(transition.transitionId)!;
 assert.equal(doc.subjectId,"m1as-asset:asset-xyz");
 assert.equal(doc.durationSeconds,1);
 assert.equal(doc.frames.length,2);
 assert.equal(doc.frames[1].projectedEnvelopeRatio.height,0.8/1.8);
});
