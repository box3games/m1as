import { BrowserContentInput, BrowserContentOutput, BrowserContentProcessor } from "../BrowserContentProcessor.js";

export class JsonBrowserContentProcessor implements BrowserContentProcessor {
  readonly supportedMimeTypes = Object.freeze([
    "application/json",
    "text/json"
  ]);

  async process(input: BrowserContentInput): Promise<BrowserContentOutput> {
    const rawText = input.buffer.toString("utf-8");
    const safeTitle = this.escapeHtml(input.displayName);

    let formattedText = rawText;
    let isValid = true;
    let statusMessage = "Valid JSON";

    try {
      const parsed = JSON.parse(rawText);
      formattedText = JSON.stringify(parsed, null, 2);
    } catch (err: any) {
      isValid = false;
      statusMessage = "Invalid JSON: " + (err?.message || "Parse Error");
    }

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
      background: #0f172a;
      color: #e2e8f0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      display: flex;
      flex-direction: column;
    }
    header {
      padding: 10px 16px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: system-ui, sans-serif;
      font-size: 13px;
    }
    .status {
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 12px;
      background: ${isValid ? "#065f46" : "#7f1d1d"};
      color: ${isValid ? "#a7f3d0" : "#fecaca"};
    }
    pre {
      margin: 0;
      padding: 16px;
      overflow: auto;
      flex: 1;
      font-size: 13px;
      line-height: 1.5;
      tab-size: 2;
    }
  </style>
</head>
<body>
  <header>
    <strong>${safeTitle}</strong>
    <span class="status">${this.escapeHtml(statusMessage)}</span>
  </header>
  <pre>${this.escapeHtml(formattedText)}</pre>
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
