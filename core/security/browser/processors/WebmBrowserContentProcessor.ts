import { BrowserContentInput, BrowserContentOutput, BrowserContentProcessor } from "../BrowserContentProcessor.js";

export class WebmBrowserContentProcessor implements BrowserContentProcessor {
  readonly supportedMimeTypes = Object.freeze([
    "video/webm"
  ]);

  async process(input: BrowserContentInput): Promise<BrowserContentOutput> {
    const base64Data = input.buffer.toString("base64");
    const safeTitle = this.escapeHtml(input.displayName);

    const htmlStructure = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
      /* Checkerboard background reveals true VP8/VP9 alpha channel transparency */
      background-color: #1e1e1e;
      background-image:
        linear-gradient(45deg, #2c2c2c 25%, transparent 25%),
        linear-gradient(-45deg, #2c2c2c 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #2c2c2c 75%),
        linear-gradient(-45deg, transparent 75%, #2c2c2c 75%);
      background-size: 24px 24px;
      background-position: 0 0, 0 12px, 12px -12px, -12px 0;
    }
    video {
      max-width: 92%;
      max-height: 82%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
      border-radius: 6px;
    }
    #hud {
      position: absolute;
      bottom: 12px;
      left: 12px;
      right: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 14px;
      background: rgba(15, 15, 18, 0.85);
      color: #e5e7eb;
      font-size: 12px;
      border-radius: 6px;
      backdrop-filter: blur(4px);
    }
    .badge {
      background: #10b981;
      color: #052e16;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      margin-right: 8px;
    }
  </style>
</head>
<body>
  <data id="webm-binary" style="display: none;">${base64Data}</data>

  <video id="player" controls autoplay loop muted playsinline></video>

  <div id="hud">
    <div><span class="badge">WEBM</span><span>${safeTitle}</span></div>
    <div id="meta">Loading stream metadata...</div>
  </div>

  <script>
    (function () {
      try {
        const b64 = document.getElementById("webm-binary").textContent.trim();
        const byteChars = atob(b64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: "video/webm" });
        const objectUrl = URL.createObjectURL(blob);

        const video = document.getElementById("player");
        const meta = document.getElementById("meta");

        video.addEventListener("loadedmetadata", () => {
          meta.textContent = video.videoWidth + "x" + video.videoHeight + " | " + video.duration.toFixed(2) + "s";
        });

        video.src = objectUrl;
      } catch (err) {
        document.getElementById("meta").textContent = "Failed to decode WebM: " + err.message;
      }
    })();
  </script>
</body>
</html>`;

    return {
      mimeType: "text/html",
      buffer: Buffer.from(htmlStructure, "utf-8"),
      displayName: input.displayName
    };
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
