import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toCanvas } from 'html-to-image';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';

export type FaceAssetType =
  | 'color'
  | 'image'
  | 'video'
  | 'audio'
  | 'preview'
  | 'svg-preview'
  | 'glb-snapshot'
  | 'text'
  | 'pdf-snapshot';

export interface AudioSurfaceSlot {
  audio: HTMLAudioElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  analyser: AnalyserNode | null;
  freqData: Uint8Array<ArrayBuffer> | null;
  label: string;
}

/**
 * Shared M1AS multi-MIME texture & media resolver used by both
 * M1ASFaceLayerEngine (CCSA) and M1ASVFXEngine (BIG3R Sandbox).
 */
export class M1ASFaceSurfaceResolver {
  private userId: string;
  private videoElements = new Map<string, HTMLVideoElement>();
  private audioSlots = new Map<string, AudioSurfaceSlot>();
  private blobUrls = new Map<string, string>();
  private audioCtx: AudioContext | null = null;

  constructor(userId = 'dev-user') {
    this.userId = userId;
  }

  public async fetchAsBlobUrl(slotKey: string, signedUrl: string): Promise<string> {
    const res = await fetch(signedUrl, {
      headers: { 'm1as-user-id': this.userId },
    });
    if (!res.ok) throw new Error(`M1AS stream failed (${res.status})`);
    let blob = await res.blob();

    if (blob.type.includes('svg') || signedUrl.toLowerCase().includes('.svg')) {
      let svgText = await blob.text();
      if (svgText.includes('<svg') && !/<svg[^>]*\bwidth\s*=/i.test(svgText)) {
        svgText = svgText.replace(/<svg\b/i, '<svg width="1024" height="1024"');
      }
      blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    }

    const objectUrl = URL.createObjectURL(blob);
    this.blobUrls.set(slotKey, objectUrl);
    return objectUrl;
  }

  public async applyToMaterial(
    slotKey: string,
    mat: THREE.MeshStandardMaterial,
    type: FaceAssetType,
    value: string,
    label?: string,
    rotationDegrees = 0
  ): Promise<void> {
    this.cleanupSlot(slotKey, mat);

    if (type === 'color') {
      mat.color.set(value);
      mat.transparent = false;
      mat.opacity = 1;
      mat.needsUpdate = true;
      return;
    }

    if (!value) return;

    if (type === 'text') {
      mat.map = await this.renderTextToTexture(value, label || 'Text Document');
      mat.needsUpdate = true;
      return;
    }
    if (type === 'pdf-snapshot') {
      mat.map = await this.renderPdfSnapshotToTexture(value, label || 'PDF Document');
      mat.needsUpdate = true;
      return;
    }
    if (type === 'preview' || type === 'svg-preview') {
      mat.map = await this.renderPreviewToTexture(value, type === 'svg-preview');
      mat.needsUpdate = true;
      return;
    }

    const safeUrl = value.startsWith('blob:') ? value : await this.fetchAsBlobUrl(slotKey, value);

    if (type === 'glb-snapshot') {
      mat.map = await this.renderGlbSnapshotToTexture(safeUrl, label || '3D Model');
      mat.needsUpdate = true;
    } else if (type === 'audio') {
      mat.map = await this.bindAudioSlot(slotKey, safeUrl, label || 'M1AS Audio Stream');
      mat.needsUpdate = true;
    } else if (type === 'image') {
      await new Promise<void>((resolve, reject) => {
        new THREE.TextureLoader().load(
          safeUrl,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false;
            if (rotationDegrees !== 0) {
              tex.center.set(0.5, 0.5);
              tex.rotation = THREE.MathUtils.degToRad(rotationDegrees);
              tex.updateMatrix();
            }
            mat.map = tex;
            // Preserve PNG/WebP alpha transparency on planes & room overlays
            mat.transparent = true;
            mat.alphaTest = 0.02;
            mat.needsUpdate = true;
            resolve();
          },
          undefined,
          reject
        );
      });
    } else if (type === 'video') {
      const video = document.createElement('video');
      video.src = safeUrl;
      video.crossOrigin = 'anonymous';
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      const videoTex = new THREE.VideoTexture(video);
      videoTex.colorSpace = THREE.SRGBColorSpace;
      videoTex.flipY = false;

      mat.map = videoTex;
      // Preserve VP9 yuva420p alpha transparency for .webm overlays
      mat.transparent = true;
      mat.alphaTest = 0.01;
      mat.needsUpdate = true;
      this.videoElements.set(slotKey, video);
    }
  }

  public async resolveBackgroundTexture(
    bgKey: string,
    type: FaceAssetType,
    value: string,
    label?: string
  ): Promise<THREE.Texture | null> {
    if (!value || type === 'color') return null;

    if (type === 'text' || type === 'pdf-snapshot' || type === 'preview' || type === 'svg-preview') {
      const tex =
        type === 'text'
          ? await this.renderTextToTexture(value, label || 'Text Document')
          : type === 'pdf-snapshot'
            ? await this.renderPdfSnapshotToTexture(value, label || 'PDF Document')
            : await this.renderPreviewToTexture(value, type === 'svg-preview');
      tex.repeat.y = -1;
      tex.offset.y = 1;
      return tex;
    }

    const safeUrl = value.startsWith('blob:') ? value : await this.fetchAsBlobUrl(bgKey, value);

    if (type === 'glb-snapshot') {
      return await this.renderGlbSnapshotToTexture(safeUrl, label || '3D Model');
    }
    if (type === 'audio') {
      return await this.bindAudioSlot(bgKey, safeUrl, label || 'M1AS Audio Stream');
    }
    if (type === 'image') {
      return await new Promise<THREE.Texture>((resolve, reject) => {
        new THREE.TextureLoader().load(
          safeUrl,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            resolve(tex);
          },
          undefined,
          reject
        );
      });
    }
    if (type === 'video') {
      const video = document.createElement('video');
      video.src = safeUrl;
      video.crossOrigin = 'anonymous';
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      const videoTex = new THREE.VideoTexture(video);
      videoTex.colorSpace = THREE.SRGBColorSpace;
      this.videoElements.set(bgKey, video);
      return videoTex;
    }

    return null;
  }

  public toggleAudioSlot(slotKey: string): boolean {
    const slot = this.audioSlots.get(slotKey);
    if (!slot) return false;
    if (this.audioCtx?.state === 'suspended') {
      void this.audioCtx.resume();
    }
    if (slot.audio.paused) {
      slot.audio.play().catch((err) => console.warn('Audio play blocked:', err));
    } else {
      slot.audio.pause();
    }
    return true;
  }

  public tickAudioVisualizers(): void {
    for (const slot of this.audioSlots.values()) {
      if (!slot.audio.paused) {
        this.renderAudioFrame(slot);
      }
    }
  }

  public cleanupSlot(slotKey: string, mat?: THREE.MeshStandardMaterial): void {
    if (mat) {
      if (mat.map) {
        mat.map.dispose();
        mat.map = null;
      }
      mat.transparent = false;
      mat.alphaTest = 0;
      mat.color.setHex(0xffffff);
      mat.needsUpdate = true;
    }
    if (this.videoElements.has(slotKey)) {
      const video = this.videoElements.get(slotKey)!;
      video.pause();
      video.src = '';
      video.load();
      this.videoElements.delete(slotKey);
    }
    if (this.audioSlots.has(slotKey)) {
      const slot = this.audioSlots.get(slotKey)!;
      slot.audio.pause();
      slot.audio.src = '';
      slot.audio.load();
      this.audioSlots.delete(slotKey);
    }
    if (this.blobUrls.has(slotKey)) {
      URL.revokeObjectURL(this.blobUrls.get(slotKey)!);
      this.blobUrls.delete(slotKey);
    }
  }

  public destroy(): void {
    const allKeys = new Set<string>([
      ...this.videoElements.keys(),
      ...this.audioSlots.keys(),
      ...this.blobUrls.keys(),
    ]);
    allKeys.forEach((key) => this.cleanupSlot(key));
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => { });
      this.audioCtx = null;
    }
  }

  // --- Internal Builders (Audio, GLB Snapshot, SVG, Text/JSON/CSV, PDF, HTML Preview) ---

  private async bindAudioSlot(slotKey: string, blobUrl: string, label: string): Promise<THREE.CanvasTexture> {
    const audio = document.createElement('audio');
    audio.src = blobUrl;
    audio.loop = true;
    audio.preload = 'auto';

    let analyser: AnalyserNode | null = null;
    let freqData: Uint8Array<ArrayBuffer> | null = null;

    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const source = this.audioCtx.createMediaElementSource(audio);
      analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyser.connect(this.audioCtx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
    } catch (err) {
      console.warn('[M1ASFaceSurfaceResolver] Web Audio analyser fallback:', err);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;

    const slot: AudioSurfaceSlot = { audio, canvas, ctx, texture, analyser, freqData, label };
    this.audioSlots.set(slotKey, slot);
    this.renderAudioFrame(slot);
    return texture;
  }

  private renderAudioFrame(slot: AudioSurfaceSlot): void {
    const { ctx, canvas, audio, analyser, freqData, label, texture } = slot;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('M1AS INTERACTIVE AUDIO', w / 2, 58);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 22px sans-serif';
    const shortTitle = label.length > 28 ? label.slice(0, 25) + '...' : label;
    ctx.fillText(shortTitle, w / 2, 98);
    const cx = w / 2;
    const cy = 205;
    ctx.beginPath();
    ctx.arc(cx, cy, 54, 0, Math.PI * 2);
    ctx.fillStyle = audio.paused ? '#0076ff' : '#10b981';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    if (audio.paused) {
      ctx.beginPath();
      ctx.moveTo(cx - 14, cy - 22);
      ctx.lineTo(cx - 14, cy + 22);
      ctx.lineTo(cx + 24, cy);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(cx - 18, cy - 20, 12, 40);
      ctx.fillRect(cx + 6, cy - 20, 12, 40);
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.fillText(audio.paused ? 'Click Surface to Play' : 'Playing • Click Surface to Pause', w / 2, 290);
    const barCount = 24;
    const barAreaWidth = 400;
    const startX = (w - barAreaWidth) / 2;
    const baseY = 415;
    const barWidth = barAreaWidth / barCount - 4;
    if (analyser && freqData && !audio.paused) {
      analyser.getByteFrequencyData(freqData);
    }
    for (let i = 0; i < barCount; i++) {
      const val = analyser && freqData && !audio.paused ? freqData[i] / 255 : 0.08;
      const barH = Math.max(8, val * 95);
      ctx.fillStyle = audio.paused ? '#334155' : '#38bdf8';
      ctx.fillRect(startX + i * (barWidth + 4), baseY - barH, barWidth, barH);
    }
    const progress = audio.duration ? Math.min(1, audio.currentTime / audio.duration) : 0;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(56, 445, w - 112, 12);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(56, 445, (w - 112) * progress, 12);
    texture.needsUpdate = true;
  }
  private async renderGlbSnapshotToTexture(glbBlobUrl: string, label: string): Promise<THREE.CanvasTexture> {
    const size = 512;
    const offscreenRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    offscreenRenderer.setSize(size, size, false);
    const snapScene = new THREE.Scene();
    snapScene.background = new THREE.Color(0x0f172a);
    const snapCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    snapCamera.position.set(2.1, 1.7, 2.7);
    snapCamera.lookAt(0, 0, 0);
    snapScene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(4, 7, 5);
    snapScene.add(keyLight);
    try {
      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        new GLTFLoader().load(glbBlobUrl, resolve, undefined, reject);
      });
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const boxSize = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z) || 1;
      model.position.sub(center);
      model.scale.setScalar(1.65 / maxDim);
      snapScene.add(model);
      offscreenRenderer.render(snapScene, snapCamera);
      const outCanvas = document.createElement('canvas');
      outCanvas.width = size;
      outCanvas.height = size;
      const ctx = outCanvas.getContext('2d')!;
      ctx.drawImage(offscreenRenderer.domElement, 0, 0, size, size);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
      ctx.fillRect(0, size - 48, size, 48);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`3D SNAPSHOT • ${label}`, size / 2, size - 18);
      const tex = new THREE.CanvasTexture(outCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.needsUpdate = true;
      return tex;
    } finally {
      offscreenRenderer.dispose();
    }
  }

  private async renderTextToTexture(urlOrText: string, label: string): Promise<THREE.CanvasTexture> {
    let content = urlOrText;
    if (/^(https?:\/\/|\/|blob:)/.test(urlOrText)) {
      const res = await fetch(urlOrText, { headers: { 'm1as-user-id': this.userId } });
      if (!res.ok) throw new Error(`Text fetch failed (${res.status})`);
      content = await res.text();
    }
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const safeLabel = label
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const clipped = escaped.length > 6000 ? escaped.slice(0, 6000) + '\n... [truncated]' : escaped;
    const htmlDoc = `<!DOCTYPE html><html><body style="margin:0;width:1024px;height:1024px;background:#0f172a;color:#f8fafc;padding:32px;box-sizing:border-box;font-family:monospace;font-size:19px;overflow:hidden;"><h3 style="color:#38bdf8;margin-top:0;">${safeLabel}</h3><pre style="white-space:pre-wrap;word-break:break-word;">${clipped}</pre></body></html>`;
    const blobUrl = URL.createObjectURL(new Blob([htmlDoc], { type: 'text/html;charset=utf-8' }));
    try {
      return (await this.renderPreviewToTexture(blobUrl, false)) as THREE.CanvasTexture;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  private async renderPdfSnapshotToTexture(pdfUrl: string, label: string): Promise<THREE.CanvasTexture> {
    const res = await fetch(pdfUrl, { headers: { 'm1as-user-id': this.userId } });
    if (!res.ok) throw new Error(`PDF fetch failed (${res.status})`);
    const arrayBuffer = await res.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), useWorkerFetch: false }).promise;
    try {
      const page = await pdf.getPage(1);
      const size = 1024;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = size;
      outCanvas.height = size;
      const ctx = outCanvas.getContext('2d')!;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, size, size);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min((size - 96) / baseViewport.width, (size - 96) / baseViewport.height);
      const viewport = page.getViewport({ scale });
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = Math.round(viewport.width);
      pageCanvas.height = Math.round(viewport.height);
      await page.render({ canvas: pageCanvas, canvasContext: pageCanvas.getContext('2d')!, viewport }).promise;
      ctx.drawImage(pageCanvas, (size - pageCanvas.width) / 2, (size - 48 - pageCanvas.height) / 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(0, size - 48, size, 48);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`PDF SNAPSHOT (Page 1 of ${pdf.numPages}) • ${label}`, size / 2, size - 18);
      const tex = new THREE.CanvasTexture(outCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.needsUpdate = true;
      return tex;
    } finally {
      const destroy = (pdf as { destroy?: () => void | Promise<void> }).destroy;
      if (destroy) await destroy.call(pdf);
    }
  }
  private async renderSvgOrBlobToTexture(urlOrSvg: string): Promise<THREE.CanvasTexture> {
    let svgMarkup = urlOrSvg;
    if (/^(https?:\/\/|\/)/.test(urlOrSvg)) {
      const res = await fetch(urlOrSvg, { headers: { 'm1as-user-id': this.userId } });
      if (!res.ok) throw new Error(`SVG fetch failed (${res.status})`);
      svgMarkup = await res.text();
    }
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(svgBlob);
    return await new Promise<THREE.CanvasTexture>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d')!;
        const natW = img.naturalWidth || 1024;
        const natH = img.naturalHeight || 1024;
        const scale = Math.min(940 / natW, 940 / natH);
        ctx.drawImage(img, (1024 - natW * scale) / 2, (1024 - natH * scale) / 2, natW * scale, natH * scale);
        URL.revokeObjectURL(objectUrl);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.needsUpdate = true;
        resolve(tex);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      };
      img.src = objectUrl;
    });
  }
  private async renderPreviewToTexture(previewUrl: string, forceSvg = false): Promise<THREE.Texture> {
    if (forceSvg) return await this.renderSvgOrBlobToTexture(previewUrl);
    const res = await fetch(previewUrl, { headers: { 'm1as-user-id': this.userId } });
    if (!res.ok) throw new Error(`Preview fetch failed (${res.status})`);
    const html = await res.text();
    const tempIframe = document.createElement('iframe');
    tempIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    tempIframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1024px;height:1024px;border:none;';
    try {
      await new Promise((resolve) => {
        tempIframe.onload = () => setTimeout(resolve, 180);
        tempIframe.srcdoc = html;
        document.body.appendChild(tempIframe);
      });
      const doc = tempIframe.contentDocument;
      if (!doc?.body) throw new Error('Preview document body was empty');
      doc.body.style.margin = '0';
      doc.body.style.width = '1024px';
      doc.body.style.minHeight = '1024px';
      doc.body.style.backgroundColor = '#ffffff';
      const styledCanvas = await toCanvas(doc.body, {
        width: 1024,
        height: 1024,
        backgroundColor: '#ffffff',
        pixelRatio: 1,
        skipFonts: true,
      });
      const tex = new THREE.CanvasTexture(styledCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.needsUpdate = true;
      return tex;
    } finally {
      tempIframe.remove();
    }
  }
}