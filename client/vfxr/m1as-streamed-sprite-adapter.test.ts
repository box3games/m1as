import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { loadVfxrM1asStreamedSprite } from "./m1as-streamed-sprite-adapter.js";
import type { M1asAsset } from "../viewer/types.js";
import type { ManagedTextureHandle } from "../textures/ResolveM1ASTexture.js";

function makeResolver(width=256,height=512,seen?:unknown[]) {
 return async (url:string,mime:string,options:{userId:string;label:string;flipY:boolean}):Promise<ManagedTextureHandle>=>{
  seen?.push({url,mime,options});
  const texture=new THREE.DataTexture(new Uint8Array(width*height*4),width,height);
  let disposed=false;
  return {texture,mimeType:mime,slotKey:"test",dispose(){if(!disposed){disposed=true;texture.dispose();}}};
 };
}
const asset:M1asAsset={id:"asset-123",displayName:"Hero.webp",mimeType:"image/webp",size:1024,capabilities:{canStream:true}};
test("loads an authenticated M1AS image stream as a VFXR sprite subject",async()=>{
 const seen:unknown[]=[];const loaded=await loadVfxrM1asStreamedSprite({asset,signedUrl:"https://m1as.test/signed",userId:"user-1",targetHeightMeters:2},makeResolver(256,512,seen));
 assert.equal(loaded.subject.assetId,"asset-123");assert.equal(loaded.subject.assetKind,"m1as-image");assert.equal(loaded.subject.initialDimensions.y,2);assert.equal(loaded.subject.initialDimensions.x,1);assert.equal(loaded.source.streamCapability,"declared");
 assert.equal(loaded.sprite.scale.y,2);assert.equal((seen[0] as {options:{userId:string}}).options.userId,"user-1");loaded.dispose();
});
test("accepts M1AS video streams and preserves stream metadata",async()=>{
 const videoAsset={...asset,mimeType:"video/webm"};const loaded=await loadVfxrM1asStreamedSprite({asset:videoAsset,signedUrl:"https://m1as.test/video?sig=x",userId:"user-1"},makeResolver(640,360));
 assert.equal(loaded.subject.assetKind,"m1as-video");assert.ok(Math.abs(loaded.subject.initialDimensions.x-16/9)<1e-9);loaded.dispose();
});
test("requires explicit snapshot mode for streamed GLB and rejects unsupported streams",async()=>{
 const glb={...asset,mimeType:"model/gltf-binary",displayName:"hero.glb"};
 await assert.rejects(()=>loadVfxrM1asStreamedSprite({asset:glb,signedUrl:"https://m1as.test/glb",userId:"u"},makeResolver()),/explicitly requested/);
 const loaded=await loadVfxrM1asStreamedSprite({asset:glb,signedUrl:"https://m1as.test/glb",userId:"u",glbProjection:"snapshot"},makeResolver());
 assert.equal(loaded.subject.assetKind,"m1as-glb-snapshot");loaded.dispose();
 await assert.rejects(()=>loadVfxrM1asStreamedSprite({asset:{...asset,mimeType:"audio/mpeg"},signedUrl:"url",userId:"u"},makeResolver()),/supports image/);
});
test("rejects assets that explicitly deny streaming and missing dimensions",async()=>{
 await assert.rejects(()=>loadVfxrM1asStreamedSprite({asset:{...asset,capabilities:{canStream:false}},signedUrl:"url",userId:"u"},makeResolver()),/denies streaming/);
 await assert.rejects(()=>loadVfxrM1asStreamedSprite({asset,signedUrl:"url",userId:"u"},makeResolver(0,0)),/no measurable/);
});
