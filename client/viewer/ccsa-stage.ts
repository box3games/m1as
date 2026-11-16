import { FaceLayerEngineFactory, FaceSlotKey, IFaceLayerEngine } from '../viewer/types.js' ;

export interface CcsaStageOptions {
    userId: string;
    engineFactory: FaceLayerEngineFactory;
}

export class CcsaStageController {
    private readonly userId: string;
    private readonly engineFactory: FaceLayerEngineFactory;
    private activeEngine: IFaceLayerEngine | null = null;

    private readonly streamUrlInput = document.getElementById("streamUrlInput") as HTMLInputElement;
    private readonly renderBtn = document.getElementById("renderComponentBtn") as HTMLButtonElement;
    private readonly componentStage = document.getElementById("componentStage") as HTMLElement;

    constructor(options: CcsaStageOptions) {
        this.userId = options.userId;
        this.engineFactory = options.engineFactory;
        this.bindEvents();
    }

    isActive(): boolean {
        return this.activeEngine !== null;
    }

    getCanvas(): HTMLCanvasElement | null {
        return this.activeEngine ? this.activeEngine.getCanvas() : null;
    }

    setTransparentBackground(enabled: boolean): void {
        this.activeEngine?.setTransparentBackground(enabled);
    }

    async setClickVfx(webmUrl: string): Promise<void> {
        if (!this.activeEngine) return;
        await this.activeEngine.setClickVfx(webmUrl);
    }

    async applyAssetToSlot(
        slotKey: FaceSlotKey,
        assetType: string,
        targetUrl: string,
        displayName: string
    ): Promise<void> {
        if (!this.activeEngine) return;

        const insType = document.getElementById(`ins-type-${slotKey}`) as HTMLSelectElement | null;
        const insVal = document.getElementById(`ins-val-${slotKey}`) as HTMLInputElement | null;
        const insPicker = document.getElementById(`ins-picker-${slotKey}`) as HTMLInputElement | null;

        if (insType && insVal) {
            const supportedOptions = [
                "color",
                "text",
                "pdf-snapshot",
                "image",
                "svg-preview",
                "video",
                "preview"
            ];
            insType.value = supportedOptions.includes(assetType) ? assetType : "image";
            insVal.value = targetUrl;
            if (insPicker) insPicker.classList.add("is-hidden");
        }

        if (slotKey === "bg") {
            await this.activeEngine.updateBackground(assetType, targetUrl, displayName);
        } else {
            await this.activeEngine.updateFace(slotKey, assetType, targetUrl, displayName);
        }
    }

    async renderComponentInstance(url: string, name = "Streamed Asset", explicitMime = ""): Promise<void> {
        if (!url || url.trim() === "") return;

        this.streamUrlInput.value = url;

        if (this.activeEngine) {
            this.activeEngine.destroy();
            this.activeEngine = null;
        }

        this.componentStage.innerHTML = `<div id="m1as-loading" class="stage-placeholder stage-placeholder--loading">Streaming binary payload data directly over network...</div>`;

        try {
            const response = await fetch(url, { headers: { "m1as-user-id": this.userId } });
            if (!response.ok) throw new Error(`Streaming dropped status code: ${response.status}`);

            const blob = await response.blob();
            const mime = explicitMime || blob.type.toLowerCase().trim();
            const safeBlobUrl = URL.createObjectURL(blob);

            this.componentStage.innerHTML = "";

            const wrapper = document.createElement("div");
            wrapper.className = "m1as-interactive-wrapper";

            const stageSurface = document.createElement("div");
            stageSurface.className = "m1as-stage-surface";

            const actionBadge = document.createElement("button");
            actionBadge.type = "button";
            actionBadge.className = "m1as-btn-label";
            actionBadge.innerText = "Composable Action";
            actionBadge.onclick = () =>
                alert(`🎯 M1AS Composable Action! Event executed cleanly for [${mime}] element: ${name}`);

            if (mime === "model/gltf-binary" || name.toLowerCase().endsWith(".glb")) {
                const canvas = document.createElement("canvas");
                canvas.className = "inline-3d-canvas";

                stageSurface.appendChild(canvas);
                stageSurface.appendChild(actionBadge);
                wrapper.appendChild(stageSurface);

                const inspector = this.buildFaceInspectorPanel((slotKey, type, val) => {
                    if (slotKey === "bg") {
                        void this.activeEngine?.updateBackground(type, val);
                    } else {
                        void this.activeEngine?.updateFace(slotKey, type, val);
                    }
                });

                wrapper.appendChild(inspector);
                this.componentStage.appendChild(wrapper);

                this.activeEngine = await this.engineFactory(canvas, safeBlobUrl);
            } else {
                wrapper.classList.add("compact-media");
                const renderNode = this.createMediaNode(mime, safeBlobUrl);
                renderNode.classList.add("inline-3d-canvas");

                stageSurface.appendChild(renderNode);
                stageSurface.appendChild(actionBadge);
                wrapper.appendChild(stageSurface);
                this.componentStage.appendChild(wrapper);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.componentStage.innerHTML = `
                <div class="stage-error-box">
                    <strong>⚠️ M1AS Playground Exception:</strong> ${message}
                </div>`;
        }
    }
    private bindEvents(): void {
        this.renderBtn.addEventListener("click", () => {
            const urlValue = this.streamUrlInput.value.trim();
            if (!urlValue) {
                alert("Please drop a valid target signed link parameter string inside the box first.");
                return;
            }
            void this.renderComponentInstance(urlValue, "Manually Injected Asset");
        });
    }

    private createMediaNode(mime: string, safeBlobUrl: string): HTMLElement {
        if (mime.startsWith("video/")) {
            const video = document.createElement("video");
            video.autoplay = true;
            video.muted = true;
            video.controls = true;
            video.loop = true;
            video.playsInline = true;
            video.src = safeBlobUrl;
            return video;
        }

        if (mime.startsWith("audio/")) {
            const audio = document.createElement("audio");
            audio.autoplay = true;
            audio.controls = true;
            audio.src = safeBlobUrl;
            audio.classList.add("inline-audio-player");
            return audio;
        }

        if (mime === "application/pdf") {
            const embed = document.createElement("embed");
            embed.type = "application/pdf";
            embed.src = safeBlobUrl;
            return embed;
        }

        if (mime.startsWith("image/") || mime === "image/svg+xml") {
            const img = document.createElement("img");
            img.classList.add("inline-media-contain");
            img.src = safeBlobUrl;
            return img;
        }

        const iframe = document.createElement("iframe");
        iframe.sandbox = "allow-scripts";
        iframe.src = safeBlobUrl;
        return iframe;
    }

    private buildFaceInspectorPanel(
        onSlotChange: (slotKey: FaceSlotKey, type: string, val: string) => void
    ): HTMLElement {
        const inspector = document.createElement("div");
        inspector.className = "m1as-visualization-inspector";
        inspector.innerHTML = `<div class="inspector-title"><span>Visualization Layer Face Maps</span></div>`;

        const layerSlots: Array<{ key: FaceSlotKey; label: string; defaultColor: string }> = [
            { key: "bg", label: "Scene Background", defaultColor: "#18181B" },
            { key: 0, label: "Right (0)", defaultColor: "#333333" },
            { key: 1, label: "Left (1)", defaultColor: "#333333" },
            { key: 2, label: "Top (2)", defaultColor: "#333333" },
            { key: 3, label: "Bottom (3)", defaultColor: "#333333" },
            { key: 4, label: "Front (4)", defaultColor: "#333333" },
            { key: 5, label: "Back (5)", defaultColor: "#333333" }
        ];

        layerSlots.forEach((slot) => {
            const row = document.createElement("div");
            row.className = slot.key === "bg" ? "face-slot-row face-slot-row--bg" : "face-slot-row";

            row.innerHTML = `
                <div class="face-label">${slot.label}</div>
                <div class="control-flex">
                    <select id="ins-type-${slot.key}" class="m1as-select">
                        <option value="color">Color</option>
                        <option value="text">Text</option>
                        <option value="pdf-snapshot">PDF Snapshot</option>
                        <option value="image">Image</option>
                        <option value="svg-preview">SVG Vector</option>
                        <option value="video">Video</option>
                        <option value="preview">HTML / Doc</option>
                    </select>
                    <input type="color" id="ins-picker-${slot.key}" class="m1as-color-picker" value="${slot.defaultColor}" />
                    <input type="text" id="ins-val-${slot.key}" class="m1as-input-txt" value="${slot.defaultColor}" placeholder="${slot.defaultColor}" />
                </div>
            `;
            inspector.appendChild(row);

            const typeSel = row.querySelector(`#ins-type-${slot.key}`) as HTMLSelectElement;
            const colorPicker = row.querySelector(`#ins-picker-${slot.key}`) as HTMLInputElement;
            const valIn = row.querySelector(`#ins-val-${slot.key}`) as HTMLInputElement;

            const triggerUpdate = () => {
                const type = typeSel.value;
                const val = valIn.value.trim();
                if (val) onSlotChange(slot.key, type, val);
            };

            typeSel.addEventListener("change", () => {
                if (typeSel.value === "color") {
                    colorPicker.classList.remove("is-hidden");
                    valIn.value = colorPicker.value.toUpperCase();
                    valIn.placeholder = slot.defaultColor;
                    triggerUpdate();
                } else {
                    colorPicker.classList.add("is-hidden");
                    valIn.value = "";
                    valIn.placeholder = "Paste M1AS URL & press Enter...";
                }
            });

            colorPicker.addEventListener("input", (e) => {
                const target = e.target as HTMLInputElement;
                valIn.value = target.value.toUpperCase();
                triggerUpdate();
            });

            valIn.addEventListener("change", triggerUpdate);
        });

        return inspector;
    }
}
