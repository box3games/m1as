import * as THREE from "three";
import {
  parseTwoDimensionalSpriteExperimentConfig,
  TwoDimensionalSpriteExperimentRunner,
  type TwoDimensionalSpriteExperimentConfig,
  type TwoDimensionalSpriteExperimentResult,
} from "../growth/two-dimensional-sprite-experiment-runner.js";
import { TwoDimensionalSpriteGrowthModel } from "../growth/two-dimensional-sprite-growth-model.js";

/**
 * Standalone 2D sprite experiment surface embedded in BIG3R Sandbox.
 * It owns its preview renderer and object URLs, not the user's source files.
 */
export class TwoDimensionalSpriteLab {
  private readonly root: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly spriteLayer = new THREE.Group();
  private readonly imageInput: HTMLInputElement;
  private readonly configInput: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly telemetry: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly stepButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly exportButton: HTMLButtonElement;
  private readonly preview: HTMLElement;
  private texture: THREE.Texture | null = null;
  private sprite: THREE.Sprite | null = null;
  private runner: TwoDimensionalSpriteExperimentRunner | null = null;
  private config: TwoDimensionalSpriteExperimentConfig | null = null;
  private latestResult: TwoDimensionalSpriteExperimentResult | null = null;
  private animationFrame = 0;
  private lastFrameTime = 0;
  private accumulatedWallTime = 0;
  private running = false;
  private disposed = false;

  constructor(host: HTMLElement) {
    this.root = document.createElement("section");
    this.root.className = "big3r-2d-sprite-lab";
    this.root.innerHTML = `
      <div class="big3r-2d-sprite-lab__header">
        <div>
          <h3>2D Character Growth Lab</h3>
          <p>Load a transparent character image and a JSON experiment. This preview runs independently of the active GLB stage.</p>
        </div>
        <span class="big3r-2d-sprite-lab__tag">SPRITE EXPERIMENT</span>
      </div>
      <div class="big3r-2d-sprite-lab__files">
        <label>Character image <input data-role="image" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"></label>
        <label>Experiment JSON <input data-role="config" type="file" accept="application/json,.json"></label>
        <button data-action="load" type="button">Load Experiment</button>
      </div>
      <div class="big3r-2d-sprite-lab__workspace">
        <div class="big3r-2d-sprite-lab__preview-wrap">
          <div class="big3r-2d-sprite-lab__preview" data-role="preview"></div>
          <div class="big3r-2d-sprite-lab__controls">
            <button data-action="play" type="button" disabled>Play</button>
            <button data-action="pause" type="button" disabled>Pause</button>
            <button data-action="step" type="button" disabled>Step</button>
            <button data-action="reset" type="button" disabled>Reset</button>
            <button data-action="export" type="button" disabled>Export Telemetry</button>
          </div>
        </div>
        <div class="big3r-2d-sprite-lab__readouts">
          <div class="big3r-2d-sprite-lab__status" data-role="status">Choose a character image and experiment JSON to begin.</div>
          <div data-role="telemetry" class="big3r-2d-sprite-lab__telemetry">No experiment loaded.</div>
        </div>
      </div>`;
    host.insertAdjacentElement("afterend", this.root);

    const get = <T extends HTMLElement>(role: string): T => {
      const element = this.root.querySelector<T>(`[data-role="${role}"]`);
      if (!element) throw new Error(`2D Sprite Lab missing element: ${role}`);
      return element;
    };
    this.imageInput = get("image");
    this.configInput = get("config");
    this.status = get("status");
    this.telemetry = get("telemetry");
    this.preview = get("preview");
    this.playButton = get("play");
    this.pauseButton = get("pause");
    this.stepButton = get("step");
    this.resetButton = get("reset");
    this.exportButton = get("export");

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", "2D character growth preview");
    this.preview.appendChild(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x0f172a, 0);
    this.camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.scene.add(this.spriteLayer);

    this.root.querySelector<HTMLButtonElement>('[data-action="load"]')?.addEventListener("click", () => void this.loadExperiment());
    this.playButton.addEventListener("click", () => this.play());
    this.pauseButton.addEventListener("click", () => this.pause());
    this.stepButton.addEventListener("click", () => void this.step());
    this.resetButton.addEventListener("click", () => void this.reset());
    this.exportButton.addEventListener("click", () => this.exportTelemetry());
    this.resize();
    window.addEventListener("resize", this.resize);
    this.render();
  }

  destroy(): void {
    this.disposed = true;
    this.pause();
    window.removeEventListener("resize", this.resize);
    this.runner?.dispose();
    this.runner = null;
    this.texture?.dispose();
    this.texture = null;
    this.renderer.dispose();
    this.root.remove();
  }

  private readonly resize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.preview.clientWidth);
    const height = Math.max(1, this.preview.clientHeight);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const halfHeight = 4;
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.render();
  };

  private async loadExperiment(): Promise<void> {
    this.pause();
    const imageFile = this.imageInput.files?.item(0);
    const configFile = this.configInput.files?.item(0);
    if (!imageFile || !configFile) {
      this.setStatus("Select both a character image and an experiment JSON file.");
      return;
    }
    try {
      const config = parseTwoDimensionalSpriteExperimentConfig(await configFile.text());
      const extension = imageFile.name.split(".").pop()?.toLowerCase() ?? "";
      const assetKind = extension === "jpg" ? "jpeg" : extension;
      if (!["png", "jpeg", "webp"].includes(assetKind)) {
        throw new Error("Supported character images are PNG, JPEG, and WebP.");
      }
      if (config.subject.assetKind !== assetKind) {
        throw new Error(`JSON subject.assetKind is "${config.subject.assetKind}", but the selected image is "${assetKind}". Update the JSON to match.`);
      }
      const imageUrl = URL.createObjectURL(imageFile);
      let texture: THREE.Texture;
      try {
        texture = await new THREE.TextureLoader().loadAsync(imageUrl);
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
      this.disposeExperiment();
      this.texture?.dispose();
      this.texture = texture;
      this.config = {
        ...config,
        subject: { ...config.subject, assetId: imageFile.name },
      };
      await this.createRunner();
      this.setStatus(`Loaded ${imageFile.name} · ${config.experimentId} · ${config.durationSeconds}s`);
      this.setControlsEnabled(true);
      this.latestResult = null;
      this.updateTelemetry();
      this.render();
    } catch (error) {
      this.setStatus(`Load failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async createRunner(): Promise<void> {
    if (!this.texture || !this.config) throw new Error("Load an image and configuration first.");
    this.spriteLayer.clear();
    const material = new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthTest: false });
    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(
      this.config.subject.initialDimensions.x,
      this.config.subject.initialDimensions.y,
      1,
    );
    this.spriteLayer.add(this.sprite);
    const model = new TwoDimensionalSpriteGrowthModel(this.sprite);
    this.runner = new TwoDimensionalSpriteExperimentRunner(model, this.config);
    await this.runner.initialize();
    this.updateTelemetry();
  }

  private async reset(): Promise<void> {
    this.pause();
    if (!this.config || !this.texture) return;
    this.disposeExperiment();
    await this.createRunner();
    this.latestResult = null;
    this.setStatus("Experiment reset to its initial sprite state.");
    this.render();
  }

  private play(): void {
    if (!this.runner || this.runner.isComplete || this.running) return;
    this.running = true;
    this.lastFrameTime = 0;
    this.accumulatedWallTime = 0;
    this.playButton.disabled = true;
    this.pauseButton.disabled = false;
    this.stepButton.disabled = true;
    this.animationFrame = requestAnimationFrame(this.playFrame);
  }

  private readonly playFrame = (timestamp: number): void => {
    if (!this.running || this.disposed || !this.runner) return;
    if (this.lastFrameTime === 0) this.lastFrameTime = timestamp;
    const elapsed = Math.min(0.25, (timestamp - this.lastFrameTime) / 1000);
    this.lastFrameTime = timestamp;
    this.accumulatedWallTime += elapsed;
    const stepDuration = this.config?.timestepSeconds ?? 0.05;
    void this.advancePlayback(stepDuration);
  };

  private async advancePlayback(stepDuration: number): Promise<void> {
    if (!this.running || !this.runner) return;
    let steps = 0;
    while (this.accumulatedWallTime >= stepDuration && steps < 8 && this.running) {
      this.accumulatedWallTime -= stepDuration;
      await this.runner.step();
      steps += 1;
      this.updateTelemetry();
      if (this.runner.isComplete) {
        this.pause();
        this.setStatus("Experiment completed.");
        break;
      }
    }
    this.render();
    if (this.running) this.animationFrame = requestAnimationFrame(this.playFrame);
  }

  private pause(): void {
    this.running = false;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.playButton.disabled = !this.runner || this.runner.isComplete;
    this.pauseButton.disabled = true;
    this.stepButton.disabled = !this.runner || this.runner.isComplete;
  }

  private async step(): Promise<void> {
    if (!this.runner || this.runner.isComplete || this.running) return;
    await this.runner.step();
    this.updateTelemetry();
    this.render();
    if (this.runner.isComplete) {
      this.setStatus("Experiment completed.");
      this.pause();
    }
  }

  private updateTelemetry(): void {
    if (!this.runner) {
      this.telemetry.textContent = "No experiment loaded.";
      return;
    }
    const sample = this.runner.simulationTimeSeconds;
    const config = this.config;
    const progress = config ? Math.min(100, sample / config.durationSeconds * 100) : 0;
    const spriteScale = this.sprite?.scale.x ?? 0;
    this.telemetry.textContent = [
      `Simulation time: ${sample.toFixed(2)}s / ${config?.durationSeconds.toFixed(2) ?? "—"}s`,
      `Sprite width scale: ${spriteScale.toFixed(3)}`,
      `Progress: ${progress.toFixed(1)}%`,
      `State: ${this.runner.isComplete ? "completed" : this.running ? "playing" : "paused"}`,
    ].join("\n");
  }

  private render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  private setStatus(message: string): void {
    this.status.textContent = message;
  }

  private setControlsEnabled(enabled: boolean): void {
    this.playButton.disabled = !enabled;
    this.pauseButton.disabled = true;
    this.stepButton.disabled = !enabled;
    this.resetButton.disabled = !enabled;
    this.exportButton.disabled = !enabled;
  }

  private disposeExperiment(): void {
    this.runner?.dispose();
    this.runner = null;
    if (this.sprite) {
      this.sprite.material.dispose();
      this.spriteLayer.remove(this.sprite);
      this.sprite = null;
    }
  }

  private exportTelemetry(): void {
    if (!this.config || !this.runner) return;
    const payload = {
      experimentId: this.config.experimentId,
      configurationVersion: this.config.configurationVersion,
      simulationTimeSeconds: this.runner.simulationTimeSeconds,
      complete: this.runner.isComplete,
      latestSample: this.telemetry.textContent,
      samples: this.runner.capturedSamples,
      commandResults: this.runner.capturedCommandResults,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${this.config.experimentId}-telemetry.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
