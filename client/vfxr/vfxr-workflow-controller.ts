import * as THREE from "three";
import type { M1asAsset } from "../viewer/types.js";
import { loadVfxrM1asStreamedSprite } from "./m1as-streamed-sprite-adapter.js";
import { VfxrPoseSequenceAuthoringTarget } from "./pose-sequence-authoring-target.js";
import { VfxrPoseTransitionAdapter } from "../evaluation/character-pose-transition-adapters.js";
import { validateCharacterPoseTransition, type CharacterPoseTransition } from "../evaluation/character-pose-transition-contract.js";

export interface VfxrWorkflowOptions {
  host: HTMLElement;
  userId: string;
  getSignedAssetUrl: (assetId: string) => Promise<string>;
}
const CONFIGURATION_VERSION = "vfxr-streamed-workflow/1.0";
const DEFAULT_POSE_SEQUENCE: CharacterPoseTransition = {
  transitionId: "vfxr-standing-to-squat",
  subjectId: "select-a-streamed-asset",
  durationSeconds: 1,
  supportedRepresentations: ["2d", "2.5d", "3d"],
  configurationVersion: CONFIGURATION_VERSION,
  growthStateId: "vfxr-initial",
  keyframes: [
    { timeSeconds: 0, poseKind: "neutral-standing", envelope: { width: 0.6, height: 1.8, depth: 0.35 }, jointTargets: [], envelopeInterpolation: "linear", jointInterpolation: "linear" },
    { timeSeconds: 1, poseKind: "compressed-squat", envelope: { width: 0.9, height: 0.72, depth: 0.5 }, jointTargets: [], envelopeInterpolation: "smoothstep", jointInterpolation: "smoothstep" },
  ],
};
function isSupportedAsset(asset: M1asAsset): boolean {
  const mime = asset.mimeType.toLowerCase();
  const name = asset.displayName.toLowerCase();
  return asset.capabilities?.canStream !== false &&
    (mime.startsWith("image/") || mime.startsWith("video/") || mime.includes("gltf") || name.endsWith(".glb"));
}

/**
 * Dedicated VFXR workflow surface: selects authenticated M1AS streams, previews
 * the 2D growth subject, and authors shared pose-transition documents.
 * It is independent of BIG3R's sandbox lifecycle and renderer.
 */
export class VfxrWorkflowController {
  private readonly root: HTMLElement;
  private readonly assetSelect: HTMLSelectElement;
  private readonly heightInput: HTMLInputElement;
  private readonly loadButton: HTMLButtonElement;
  private readonly growButton: HTMLButtonElement;
  private readonly advanceButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly authorButton: HTMLButtonElement;
  private readonly exportButton: HTMLButtonElement;
  private readonly transitionInput: HTMLTextAreaElement;
  private readonly status: HTMLElement;
  private readonly preview: HTMLElement;
  private readonly telemetry: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
  private readonly poseTarget = new VfxrPoseSequenceAuthoringTarget({
    targetId: "vfxr.streamed-character.pose-authoring",
    supportedPoseKinds: ["neutral-standing", "spine-hunch", "compressed-squat", "tucked-squat", "deep-squat", "seated-v", "crawl", "custom"],
  });
  private readonly poseAdapter = new VfxrPoseTransitionAdapter(this.poseTarget);
  private assets: M1asAsset[] = [];
  private active: VfxrM1asStreamedSpriteSubject | null = null;
  private elapsedSeconds = 0;
  private disposed = false;

  constructor(options: VfxrWorkflowOptions) {
    this.root = document.createElement("section");
    this.root.className = "playground-panel vfxr-streamed-workflow";
    this.root.style.cssText = "margin-top:18px;padding:18px;background:#111827;color:#e5e7eb;border:1px solid #334155;border-radius:10px";
    this.root.innerHTML = `
      <h2 style="margin:0 0 6px;color:#a78bfa">VFXR · 2D Growth & Pose Authoring</h2>
      <p style="margin:0 0 14px;color:#cbd5e1">Independent VFXR workspace. Select an authenticated M1AS image, video/WEBM, or GLB snapshot stream. The stable M1AS asset ID follows the subject into 2D growth and pose authoring.</p>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:12px">
        <label style="display:grid;gap:4px;flex:1;min-width:220px">M1AS streamed asset<select data-role="asset" style="padding:9px;background:#030712;color:#e5e7eb;border:1px solid #475569;border-radius:6px"><option value="">Load public assets first…</option></select></label>
        <label style="display:grid;gap:4px">Target height (m)<input data-role="height" type="number" min="0.001" step="0.1" value="1.8" style="width:130px;padding:9px;background:#030712;color:#e5e7eb;border:1px solid #475569;border-radius:6px"></label>
        <button data-role="load" type="button">Load M1AS stream</button>
      </div>
      <div style="display:grid;grid-template-columns:minmax(240px,1fr) minmax(260px,1fr);gap:14px">
        <div>
          <div data-role="preview" style="height:360px;min-height:260px;background:#030712;border:1px solid #334155;border-radius:8px;overflow:hidden"></div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
            <button data-role="grow" type="button" disabled>Grow +25%</button>
            <button data-role="advance" type="button" disabled>Advance 1 second</button>
            <button data-role="reset" type="button" disabled>Reset growth</button>
          </div>
          <div data-role="telemetry" style="margin-top:10px;color:#94a3b8;font:12px monospace">No streamed VFXR subject loaded.</div>
        </div>
        <div style="display:grid;gap:8px;align-content:start">
          <label style="display:grid;gap:5px">Shared pose transition JSON<textarea data-role="transition" rows="15" spellcheck="false" style="width:100%;box-sizing:border-box;background:#030712;color:#d1d5db;border:1px solid #475569;border-radius:6px;padding:10px;font:12px monospace"></textarea></label>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button data-role="author" type="button" disabled>Author VFXR pose sequence</button>
            <button data-role="export" type="button" disabled>Export sequence JSON</button>
          </div>
          <div data-role="status" role="status" style="padding:10px;background:#030712;border:1px solid #334155;border-radius:6px;color:#cbd5e1">Load an M1AS asset to begin.</div>
        </div>
      </div>
    `;
    options.host.insertAdjacentElement("afterend", this.root);
    const get = <T extends HTMLElement>(role: string): T => {
      const element = this.root.querySelector<T>(`[data-role="${role}"]`);
      if (!element) throw new Error("VFXR workflow missing " + role);
      return element;
    };
    this.assetSelect = get("asset");
    this.heightInput = get("height");
    this.loadButton = get("load");
    this.growButton = get("grow");
    this.advanceButton = get("advance");
    this.resetButton = get("reset");
    this.authorButton = get("author");
    this.exportButton = get("export");
    this.transitionInput = get("transition");
    this.status = get("status");
    this.preview = get("preview");
    this.telemetry = get("telemetry");
    this.transitionInput.value = JSON.stringify(DEFAULT_POSE_SEQUENCE, null, 2);
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", "VFXR streamed 2D character preview");
    this.preview.appendChild(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x030712, 1);
    this.camera.position.set(0, 0, 10);
    this.renderer.setAnimationLoop(() => this.render());
    this.scene.background = new THREE.Color(0x030712);
    this.loadButton.addEventListener("click", () => void this.loadSelected(options.userId, options.getSignedAssetUrl));
    this.growButton.addEventListener("click", () => this.grow());
    this.advanceButton.addEventListener("click", () => this.advance());
    this.resetButton.addEventListener("click", () => this.resetGrowth());
    this.authorButton.addEventListener("click", () => void this.authorSequence());
    this.exportButton.addEventListener("click", () => this.exportSequence());
    this.resize();
    window.addEventListener("resize", this.resize);
    this.render();
  }

  public setAssets(assets: M1asAsset[]): void {
    this.assets = assets.filter(isSupportedAsset);
    this.assetSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = this.assets.length ? "Choose an M1AS streamed asset…" : "No compatible streamed assets found";
    this.assetSelect.appendChild(placeholder);
    for (const asset of this.assets) {
      const option = document.createElement("option");
      option.value = asset.id;
      option.textContent = asset.displayName + " · " + asset.mimeType + (asset.capabilities?.canStream === true ? "" : " · stream capability unconfirmed");
      this.assetSelect.appendChild(option);
    }
    this.status.textContent = this.assets.length
      ? "Found " + this.assets.length + " compatible M1AS assets. Select one and load its authenticated stream."
      : "No image, video or GLB assets are currently eligible for this VFXR stream path.";
  }

  private async loadSelected(userId: string, getSignedAssetUrl: (assetId: string) => Promise<string>): Promise<void> {
    const asset = this.assets.find(item => item.id === this.assetSelect.value);
    if (!asset) { this.status.textContent = "Select an M1AS asset first."; return; }
    const targetHeight = Number(this.heightInput.value);
    if (!Number.isFinite(targetHeight) || targetHeight <= 0) { this.status.textContent = "Target height must be a finite positive metre value."; return; }
    this.loadButton.disabled = true;
    this.status.textContent = "Signing and resolving the selected M1AS asset stream…";
    try {
      const signedUrl = await getSignedAssetUrl(asset.id);
      const glbProjection = asset.mimeType.toLowerCase().includes("gltf") || asset.displayName.toLowerCase().endsWith(".glb") ? "snapshot" : undefined;
      const loaded = await loadVfxrM1asStreamedSprite({ asset, signedUrl, userId, targetHeightMeters: targetHeight, ...(glbProjection ? { glbProjection } : {}) });
      this.disposeActive();
      this.active = loaded;
      this.scene.add(loaded.sprite);
      loaded.growthModel.initialize(loaded.subject, { experimentId: "vfxr-streamed-growth", simulationTimeSeconds: 0, configurationVersion: CONFIGURATION_VERSION });
      this.elapsedSeconds = 0;
      this.growButton.disabled = false;
      this.advanceButton.disabled = false;
      this.resetButton.disabled = false;
      this.authorButton.disabled = false;
      this.status.textContent = "Loaded " + loaded.source.displayName + " · asset " + loaded.source.assetId + " · " + loaded.source.sourceKind + ". M1AS identity is preserved.";
      this.updateTelemetry();
      this.render();
    } catch (error) {
      this.status.textContent = "VFXR stream load failed: " + (error instanceof Error ? error.message : String(error));
    } finally {
      this.loadButton.disabled = false;
    }
  }

  private grow(): void {
    if (!this.active) return;
    const result = this.active.growthModel.apply({
      kind: "discrete", commandId: "vfxr-growth-" + (this.elapsedSeconds + 1),
      stimulus: "VFXR-manual-growth", amount: { kind: "relative_change", fraction: 0.25 }, requestedDurationSeconds: 0.5,
    }, { experimentId: "vfxr-streamed-growth", simulationTimeSeconds: this.elapsedSeconds, configurationVersion: CONFIGURATION_VERSION });
    if (!result.accepted) { this.status.textContent = result.reason ?? "Growth command rejected."; return; }
    this.advanceSeconds(0.5);
  }
  private advance(): void { this.advanceSeconds(1); }
  private advanceSeconds(delta: number): void {
    if (!this.active) return;
    this.elapsedSeconds += delta;
    this.active.growthModel.advance(this.elapsedSeconds, delta);
    this.updateTelemetry();
    this.render();
  }
  private resetGrowth(): void {
    if (!this.active) return;
    this.active.growthModel.reset();
    this.elapsedSeconds = 0;
    this.updateTelemetry();
    this.render();
  }
  private updateTelemetry(): void {
    if (!this.active) return;
    const telemetry = this.active.growthModel.readTelemetry(this.elapsedSeconds);
    this.telemetry.textContent = "M1AS " + this.active.source.assetId + " · " + this.active.source.sourceKind +
      " · Scale " + (telemetry.currentScale ?? 1).toFixed(3) + "× · Time " + this.elapsedSeconds.toFixed(2) + "s";
  }

  private async authorSequence(): Promise<void> {
    if (!this.active) { this.status.textContent = "Load an M1AS subject before authoring."; return; }
    try {
      const parsed: unknown = JSON.parse(this.transitionInput.value);
      if (!parsed || typeof parsed !== "object") throw new TypeError("Pose transition JSON must be an object.");
      const transition = parsed as CharacterPoseTransition;
      transition.subjectId = this.active.subject.subjectId;
      validateCharacterPoseTransition(transition);
      const results = [];
      for (const frame of transition.keyframes) {
        results.push(await this.poseAdapter.dispatch(transition, frame.timeSeconds));
      }
      const rejected = results.find(result => !result.accepted);
      if (rejected) throw new Error(rejected.reason ?? "VFXR rejected a pose sample.");
      this.exportButton.disabled = false;
      const document = this.poseTarget.getDocument(transition.transitionId);
      this.status.textContent = "Authored " + (document?.frames.length ?? 0) + " VFXR frames for M1AS asset " + this.active.source.assetId +
        ". This is an editable/exportable authoring document; sprite deformation and WEBM rendering remain separate production steps.";
    } catch (error) {
      this.status.textContent = "Pose sequence rejected: " + (error instanceof Error ? error.message : String(error));
    }
  }

  private exportSequence(): void {
    try {
      const parsed = JSON.parse(this.transitionInput.value) as { transitionId?: unknown };
      if (typeof parsed.transitionId !== "string") throw new TypeError("Transition ID is required.");
      const sequenceDocument = this.poseTarget.getDocument(parsed.transitionId);
      if (!sequenceDocument) throw new Error("Author the sequence before exporting.");
      const blob = new Blob([JSON.stringify(sequenceDocument, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = parsed.transitionId + ".vfxr-pose-sequence.json";
      link.click();
      URL.revokeObjectURL(url);
      this.status.textContent = "Exported VFXR pose sequence JSON.";
    } catch (error) {
      this.status.textContent = "Export failed: " + (error instanceof Error ? error.message : String(error));
    }
  }

  private disposeActive(): void {
    if (!this.active) return;
    this.scene.remove(this.active.sprite);
    this.active.dispose();
    this.active = null;
    this.growButton.disabled = true;
    this.advanceButton.disabled = true;
    this.resetButton.disabled = true;
    this.authorButton.disabled = true;
    this.exportButton.disabled = true;
  }
  private readonly resize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.preview.clientWidth);
    const height = Math.max(1, this.preview.clientHeight);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    this.camera.left = -2 * aspect;
    this.camera.right = 2 * aspect;
    this.camera.top = 2;
    this.camera.bottom = -2;
    this.camera.updateProjectionMatrix();
    this.render();
  };
  private render(): void { if (!this.disposed) this.renderer.render(this.scene, this.camera); }
  public destroy(): void {
    this.disposed = true;
    window.removeEventListener("resize", this.resize);
    this.disposeActive();
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    this.root.remove();
  }
}
