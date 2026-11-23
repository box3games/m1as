import "../viewer/styles.css";
import { M1ASVFXEngine } from "../M1ASVFXEngine.js";
import { M1ASFaceLayerEngine } from "../M1ASFaceLayerEngine.js";
import { M1asApiClient } from "../viewer/m1as-api.js";
import { Big3rSandboxController } from "../viewer/big3r-sandbox.js";
import { CcsaStageController } from "../viewer/ccsa-stage.js";
import { VfxRecorderController } from "../viewer/vfx-recorder.js";
import { FaceSlotKey, M1asAsset } from "../viewer/types.js";

const assetListEl = document.getElementById("assetList") as HTMLElement;
const viewerEl = document.getElementById("viewer") as HTMLElement;
const ttlStatusEl = document.getElementById("ttlStatus") as HTMLElement;
const loadAssetsBtn = document.getElementById("loadAssets") as HTMLButtonElement;

const api = new M1asApiClient({
    userId: "dev-user",
    onTtlTick: (html) => {
        ttlStatusEl.innerHTML = html;
    },
    onTtlExpired: () => {
        document.querySelectorAll<HTMLElement>(".url-display").forEach((el) => {
            el.innerText = 'Click "Stream" or "Sign URL"...';
            el.classList.remove("is-signed");
        });
    }
});

// 1. Isolated box3dev BIG3R Sandbox (injects M1ASVFXEngine via factory)
const big3rSandbox = new Big3rSandboxController({
    userId: api.getUserId(),
    engineFactory: (canvas, glbBlobUrl, options) => new M1ASVFXEngine(canvas, glbBlobUrl, options) as any
});

// 2. Isolated CCSA 3D Stage & Face Layer Inspector (injects M1ASFaceLayerEngine via factory)
const ccsaStage = new CcsaStageController({
    userId: api.getUserId(),
    engineFactory: (canvas, glbBlobUrl) => new M1ASFaceLayerEngine(canvas, glbBlobUrl)
});

// 3. Isolated .webm Composition Recorder
new VfxRecorderController({
    getBig3rCanvas: () => big3rSandbox.getCanvas(),
    setBig3rTransparentBg: (enabled) => big3rSandbox.setTransparentBackground(enabled),
    bindBig3rVfxWebm: (blobUrl) => big3rSandbox.setGrowthVfxOverlay(blobUrl),
    getCcsaCanvas: () => ccsaStage.getCanvas(),
    setCcsaTransparentBg: (enabled) => ccsaStage.setTransparentBackground(enabled),
    bindCcsaClickVfxWebm: (blobUrl) => ccsaStage.setClickVfx(blobUrl),
    getM1asApiBaseUrl: () => api.getBaseUrl(),
    getM1asUserId: () => api.getUserId()
});

async function signAndDisplayUrl(asset: M1asAsset): Promise<string> {
    const signedUrl = await api.getSignedAssetUrl(asset.id);
    const cardUrlDisplay = document.getElementById(`url-display-${asset.id}`);
    if (cardUrlDisplay) {
        cardUrlDisplay.innerText = signedUrl;
        cardUrlDisplay.classList.add("is-signed");
    }
    return signedUrl;
}

async function handleLoadPreview(asset: M1asAsset): Promise<void> {
    viewerEl.innerHTML = "Loading Preview...";
    const preview = await api.fetchAssetPreview(asset.id);
    if (!preview.ok) {
        viewerEl.innerHTML = `<pre>${preview.text}</pre>`;
        return;
    }

    const iframe = document.createElement("iframe");
    iframe.sandbox = "allow-scripts";
    iframe.className = "preview-iframe";
    iframe.srcdoc = preview.text;

    viewerEl.innerHTML = "";
    viewerEl.appendChild(iframe);
}

async function handleStreamAsset(asset: M1asAsset): Promise<void> {
    const signedUrl = await signAndDisplayUrl(asset);
    const currentMime = (asset.mimeType || "").toLowerCase().trim();
    await ccsaStage.renderComponentInstance(signedUrl, asset.displayName, currentMime);
    viewerEl.innerHTML = `<p class="stream-success-msg">✅ Authenticated secure payload stream targeted directly to Component Playground!</p>`;
}
async function loadPublicAssets(): Promise<void> {
    assetListEl.innerHTML = "Loading...";
    const assets = await api.fetchPublicAssets();
    assetListEl.innerHTML = "";

    void api.autoHydrateRuntimeEngine(assets);

    assets.forEach((asset) => {
        const card = document.createElement("div");
        card.className = "asset-card";

        const mime = (asset.mimeType || "").toLowerCase().trim();
        const lowerName = (asset.displayName || "").toLowerCase();
        const isGlb = mime === "model/gltf-binary" || lowerName.endsWith(".glb");
        const isSvg = mime === "image/svg+xml" || lowerName.endsWith(".svg");
        const isPdf = mime === "application/pdf" || lowerName.endsWith(".pdf");

        const isText =
            mime === "text/plain" ||
            mime === "text/csv" ||
            mime === "application/json" ||
            lowerName.endsWith(".txt") ||
            lowerName.endsWith(".csv") ||
            lowerName.endsWith(".json");

        const isStreamTexture =
            mime.startsWith("image/") ||
            mime.startsWith("video/") ||
            mime.startsWith("audio/") ||
            isPdf ||
            isText;

        const canPaintToFace = (asset.capabilities?.canStream && isStreamTexture) || asset.capabilities?.canPreview;

        const previewButton = asset.capabilities?.canPreview ? `<button class="preview-btn">Preview</button>` : "";
        const streamButton = asset.capabilities?.canStream ? `<button class="stream-btn">Stream</button>` : "";
        const signCopyButton = asset.capabilities?.canStream ? `<button class="sign-btn">Sign URL</button>` : "";
        const vfxGlbBtn = isGlb
            ? `<button class="vfx-glb-btn">🍄 Load GLB · Growth Lab / VFX Stage</button>
               <button class="vfx-prop-btn">+ Prop</button>`
            : "";
        const vfxWebmBtn =
            mime === "video/webm" ? `<button class="vfx-webm-btn">⚡ Set Growth VFX</button>` : "";
        const faceAssignSelect = canPaintToFace
            ? `<select class="face-assign-sel" title="Apply directly to active 3D cube face">
                   <option value="">Paint Face / BG...</option>
                   <option value="bg">Scene Background</option>
                   <option value="click-vfx">⚡ On-Click VFX Burst</option>
                   <option value="0">Face 0 (Right)</option>
                   <option value="1">Face 1 (Left)</option>
                   <option value="2">Face 2 (Top)</option>
                   <option value="3">Face 3 (Bottom)</option>
                   <option value="4">Face 4 (Front)</option>
                   <option value="5">Face 5 (Back)</option>
               </select>`
            : "";

        card.innerHTML = `
            <strong>${asset.displayName}</strong><br>
            <span class="asset-meta">${asset.mimeType}</span><br>
            <span class="asset-meta">${(asset.size / 1024 / 1024).toFixed(2)} MB</span><br>
            <span class="asset-url-label">Active Signed URL:</span>
            <span class="url-display" id="url-display-${asset.id}">Click "Stream" or "Sign URL"...</span>
            <div class="card-actions">
                ${previewButton}
                ${streamButton}
                ${signCopyButton}
                ${vfxGlbBtn}
                ${vfxWebmBtn}
                ${faceAssignSelect}
            </div>
        `;

        card.querySelector(".stream-btn")?.addEventListener("click", () => void handleStreamAsset(asset));
        card.querySelector(".preview-btn")?.addEventListener("click", () => void handleLoadPreview(asset));

        const signBtn = card.querySelector(".sign-btn") as HTMLButtonElement | null;
        signBtn?.addEventListener("click", async () => {
            const signedUrl = await signAndDisplayUrl(asset);
            await navigator.clipboard?.writeText(signedUrl).catch(() => {});
            signBtn.innerText = "Copied!";
            window.setTimeout(() => {
                signBtn.innerText = "Sign URL";
            }, 1500);
        });

        card.querySelector(".vfx-glb-btn")?.addEventListener("click", async () => {
            const signedUrl = await signAndDisplayUrl(asset);
            await big3rSandbox.mount(signedUrl, "", { assetId: asset.id, displayName: asset.displayName, assetKind: "glb" });
        });

        card.querySelector(".vfx-prop-btn")?.addEventListener("click", async () => {
            const signedUrl = await signAndDisplayUrl(asset);
            await big3rSandbox.spawnPropFromAsset(signedUrl, asset.displayName);
        });

        card.querySelector(".vfx-webm-btn")?.addEventListener("click", async () => {
            const signedUrl = await signAndDisplayUrl(asset);
            await big3rSandbox.setGrowthVfxOverlay(signedUrl, asset.displayName);
        });

        const faceSel = card.querySelector(".face-assign-sel") as HTMLSelectElement | null;
        faceSel?.addEventListener("change", async () => {
            const rawTarget = faceSel.value;
            faceSel.value = "";
            if (!rawTarget) return;

            if (!ccsaStage.isActive()) {
                alert("Stream a 3D .glb cube into the playground first!");
                return;
            }

            if (rawTarget === "click-vfx") {
                const signedUrl = await signAndDisplayUrl(asset);
                await ccsaStage.setClickVfx(signedUrl);
                alert(`⚡ Bound "${asset.displayName}" to 3D mesh clicks! Click the .glb object in the stage to trigger.`);
                return;
            }

            const baseUrl = api.getBaseUrl();
            let targetUrl: string;
            let assetType: string;

            if (isGlb && asset.capabilities?.canStream) {
                targetUrl = await signAndDisplayUrl(asset);
                assetType = "glb-snapshot";
            } else if (isSvg) {
                targetUrl = asset.capabilities?.canStream
                    ? await signAndDisplayUrl(asset)
                    : `${baseUrl}/assets/${asset.id}/preview`;
                assetType = "svg-preview";
            } else if (isPdf) {
                targetUrl = asset.capabilities?.canStream
                    ? await signAndDisplayUrl(asset)
                    : `${baseUrl}/assets/${asset.id}/file`;
                assetType = "pdf-snapshot";
            } else if (isText) {
                targetUrl = asset.capabilities?.canStream
                    ? await signAndDisplayUrl(asset)
                    : `${baseUrl}/assets/${asset.id}/preview`;
                assetType = "text";
            } else if (isStreamTexture && asset.capabilities?.canStream) {
                targetUrl = await signAndDisplayUrl(asset);
                if (mime.startsWith("video/")) assetType = "video";
                else if (mime.startsWith("audio/")) assetType = "audio";
                else assetType = "image";
            } else {
                targetUrl = `${baseUrl}/assets/${asset.id}/preview`;
                assetType = "preview";
            }

            const slotKey: FaceSlotKey = rawTarget === "bg" ? "bg" : Number(rawTarget);
            await ccsaStage.applyAssetToSlot(slotKey, assetType, targetUrl, asset.displayName);
        });

        assetListEl.appendChild(card);
    });
}

loadAssetsBtn.addEventListener("click", () => void loadPublicAssets());
