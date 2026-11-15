export type BrowserDisposition = "inline" | "attachment";
export type BrowserPreviewMode = "inline" | "sandboxed";

export interface BrowserContentPolicy {
    disposition: BrowserDisposition;
    previewMode: BrowserPreviewMode;
    supportsPreview: boolean;
    headers: Readonly<Record<string, string>>;
}

const NOSNIFF_HEADERS = Object.freeze({
    "X-Content-Type-Options": "nosniff"
});

const SANDBOX_HEADERS = Object.freeze({
    ...NOSNIFF_HEADERS,
    "Content-Security-Policy": "default-src 'self' https://jsdelivr.net; script-src 'unsafe-inline' 'unsafe-eval' https://jsdelivr.net; style-src 'unsafe-inline' https://jsdelivr.net; img-src 'self' data: blob: https://jsdelivr.net; media-src 'self' data: blob:; worker-src 'self' blob: data:; sandbox allow-scripts allow-same-origin;"
});

const INLINE_POLICY = Object.freeze<BrowserContentPolicy>({
    disposition: "inline",
    previewMode: "inline",
    supportsPreview: false,
    headers: NOSNIFF_HEADERS
});

const HTML_POLICY = Object.freeze<BrowserContentPolicy>({
    disposition: "attachment",
    previewMode: "sandboxed",
    supportsPreview: true,
    headers: SANDBOX_HEADERS
});

const SVG_POLICY = Object.freeze<BrowserContentPolicy>({
    disposition: "inline",
    previewMode: "sandboxed", 
    supportsPreview: true,
    headers: SANDBOX_HEADERS
});

const MARKDOWN_POLICY = Object.freeze<BrowserContentPolicy>({
    disposition: "inline",
    previewMode: "sandboxed",
    supportsPreview: true,
    headers: SANDBOX_HEADERS
});

const MERMAID_POLICY = Object.freeze<BrowserContentPolicy>({
    disposition: "inline",
    previewMode: "sandboxed",
    supportsPreview: true,
    headers: SANDBOX_HEADERS
});

const DOCX_POLICY = Object.freeze<BrowserContentPolicy>({
    disposition: "inline",
    previewMode: "inline",
    supportsPreview: true,
    headers: NOSNIFF_HEADERS
});

const XLSX_POLICY = Object.freeze<BrowserContentPolicy>({
    disposition: "inline",
    previewMode: "sandboxed",
    supportsPreview: true,
    headers: SANDBOX_HEADERS
});

const CSV_POLICY = Object.freeze<BrowserContentPolicy>({
    disposition: "inline",
    previewMode: "sandboxed",
    supportsPreview: true,
    headers: SANDBOX_HEADERS
});

const JSON_POLICY = Object.freeze<BrowserContentPolicy>({
    disposition: "inline",
    previewMode: "sandboxed",
    supportsPreview: true,
    headers: SANDBOX_HEADERS
});

const WEBM_POLICY = Object.freeze<BrowserContentPolicy>({
    disposition: "inline",
    previewMode: "sandboxed",
    supportsPreview: true,
    headers: SANDBOX_HEADERS
});

const GLB_POLICY = Object.freeze<BrowserContentPolicy>({
    disposition: "inline",
    previewMode: "inline",
    supportsPreview: true,
    headers: Object.freeze({
        ...NOSNIFF_HEADERS,
        "Content-Security-Policy": "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; worker-src * blob: data:; connect-src * blob: data:;",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, m1as-user-id"
    })
});


const XLSX_TYPES = new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
const CSV_TYPES = new Set(["text/csv", "application/vnd.ms-excel"]);
const JSON_TYPES = new Set(["application/json", "text/json"]);
const WEBM_TYPES = new Set(["video/webm"]);
const GLB_TYPES = new Set(["model/gltf-binary"]);
const DOCX_TYPES = new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const MERMAID_TYPES = new Set(["text/mermaid", "text/vnd.mermaid"]);
const MARKDOWN_TYPES = new Set(["text/markdown", "text/x-markdown"]);
const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const SVG_TYPES = new Set(["image/svg+xml"]);

export function getBrowserContentPolicy(mimeType: string): BrowserContentPolicy {
    // Defensive fallback if type is empty/missing
    if (!mimeType) return HTML_POLICY;

    // Clean parameter formatting like text/html;charset=utf-8
    const cleanMime = mimeType.toLowerCase().split(";")[0].trim();

    if (HTML_TYPES.has(cleanMime)) return HTML_POLICY;
    if (SVG_TYPES.has(cleanMime)) return SVG_POLICY;
    if (MARKDOWN_TYPES.has(cleanMime)) return MARKDOWN_POLICY;
    if (MERMAID_TYPES.has(cleanMime)) return MERMAID_POLICY;
    if (DOCX_TYPES.has(cleanMime)) return DOCX_POLICY;
    if (XLSX_TYPES.has(cleanMime)) return XLSX_POLICY;
    if (CSV_TYPES.has(cleanMime)) return CSV_POLICY;
    if (JSON_TYPES.has(cleanMime)) return JSON_POLICY;
    if (WEBM_TYPES.has(cleanMime)) return WEBM_POLICY;
    if (GLB_TYPES.has(cleanMime)) return GLB_POLICY;

    return INLINE_POLICY;
}
