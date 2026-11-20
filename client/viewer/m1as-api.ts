import { M1asAsset, SignedUrlResponse } from "./types.js";

export interface M1asApiConfig {
    apiBase?: string;
    userId?: string;
    onTtlTick?: (htmlStatus: string) => void;
    onTtlExpired?: () => void;
}

export class M1asApiClient {
    private readonly apiBase: string;
    private readonly userId: string;
    private readonly onTtlTick?: (htmlStatus: string) => void;
    private readonly onTtlExpired?: () => void;
    private countdownInterval: number | null = null;

    constructor(config: M1asApiConfig = {}) {
        this.apiBase = config.apiBase ?? window.location.origin;
        this.userId = config.userId ?? "dev-user";
        this.onTtlTick = config.onTtlTick;
        this.onTtlExpired = config.onTtlExpired;
    }

    getBaseUrl(): string {
        return this.apiBase;
    }

    getUserId(): string {
        return this.userId;
    }

    async fetchPublicAssets(): Promise<M1asAsset[]> {
        const response = await fetch(`${this.apiBase}/assets/public`);
        if (!response.ok) {
            throw new Error(`Failed to fetch public assets (${response.status})`);
        }
        return response.json();
    }

    async getSignedAssetUrl(assetId: string): Promise<string> {
        const response = await fetch(`${this.apiBase}/assets/${assetId}/signed`, {
            headers: { "m1as-user-id": this.userId }
        });
        if (!response.ok) {
            throw new Error(`Failed to sign asset URL (${response.status})`);
        }
        const signed: SignedUrlResponse = await response.json();
        this.startCountdown(signed.expires, signed.ttl);
        return `${this.apiBase}${signed.url}`;
    }

    async fetchAssetPreview(assetId: string): Promise<{ ok: boolean; text: string }> {
        const response = await fetch(`${this.apiBase}/assets/${assetId}/preview`, {
            headers: { "m1as-user-id": this.userId }
        });
        return {
            ok: response.ok,
            text: await response.text()
        };
    }

    async autoHydrateRuntimeEngine(assets: M1asAsset[]): Promise<void> {
        const firstGlb = assets.find(
            (asset) =>
                (asset.mimeType || "").toLowerCase().trim() === "model/gltf-binary" ||
                (asset.displayName || "").toLowerCase().trim().endsWith(".glb")
        );
        if (!firstGlb) return;

        try {
            const preview = await this.fetchAssetPreview(firstGlb.id);
            if (!preview.ok) return;

            const parser = new DOMParser();
            const doc = parser.parseFromString(preview.text, "text/html");
            const embeddedScripts = doc.querySelectorAll<HTMLScriptElement>("script[type='module']");
            let vendorScriptSource = "";

            embeddedScripts.forEach((script) => {
                if (!script.src && script.textContent?.includes("litPropertyMetadata")) {
                    vendorScriptSource = script.textContent;
                }
            });

            if (vendorScriptSource) {
                const parentEngineTag = document.getElementById("m1as-runtime-engine");
                if (parentEngineTag && !parentEngineTag.textContent) {
                    const newInlineScript = document.createElement("script");
                    newInlineScript.type = "module";
                    newInlineScript.textContent = vendorScriptSource;
                    document.head.appendChild(newInlineScript);
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn("Pre-hydration engine skipped:", message);
        }
    }

    private startCountdown(expires: number, ttl: number): void {
        if (this.countdownInterval !== null) {
            window.clearInterval(this.countdownInterval);
        }

        const update = () => {
            const now = Math.floor(Date.now() / 1000);
            const remaining = expires - now;

            if (remaining <= 0) {
                this.onTtlTick?.(`<strong>Signed URL Expired</strong><br>Click "Load Public Assets" to refresh.`);
                this.onTtlExpired?.();
                if (this.countdownInterval !== null) {
                    window.clearInterval(this.countdownInterval);
                    this.countdownInterval = null;
                }
                return;
            }

            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            this.onTtlTick?.(`TTL: ${ttl}s<br>Expires In: ${minutes}:${String(seconds).padStart(2, "0")}`);
        };

        update();
        this.countdownInterval = window.setInterval(update, 1000);
    }
}
