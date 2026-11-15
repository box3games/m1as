import { BrowserContentInput, BrowserContentOutput, BrowserContentProcessor } from "../BrowserContentProcessor.js";

export class CsvBrowserContentProcessor implements BrowserContentProcessor {
  readonly supportedMimeTypes = Object.freeze([
    "text/csv",
    "application/vnd.ms-excel"
  ]);

  async process(input: BrowserContentInput): Promise<BrowserContentOutput> {
    const rawText = input.buffer.toString("utf-8");
    const safeTitle = this.escapeHtml(input.displayName);
    const rows = this.parseCsv(rawText);

    const headers = rows[0] ?? [];
    const dataRows = rows.slice(1);

    const theadHtml = headers.length
      ? `<thead><tr>${headers.map(h => `<th>${this.escapeHtml(h)}</th>`).join("")}</tr></thead>`
      : "";

    const tbodyHtml = dataRows.length
      ? `<tbody>${dataRows
          .map(row => `<tr>${row.map(cell => `<td>${this.escapeHtml(cell)}</td>`).join("")}</tr>`)
          .join("")}</tbody>`
      : "<tbody><tr><td><em>No data rows</em></td></tr></tbody>";

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
      background: #f8fafc;
      color: #0f172a;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
    }
    header {
      padding: 10px 16px;
      background: #ffffff;
      border-bottom: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }
    .meta {
      color: #475569;
      font-size: 12px;
    }
    .table-wrap {
      flex: 1;
      overflow: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 8px 12px;
      text-align: left;
      white-space: nowrap;
    }
    th {
      background: #f1f5f9;
      position: sticky;
      top: 0;
      font-weight: 600;
    }
    tr:nth-child(even) td {
      background: #f8fafc;
    }
  </style>
</head>
<body>
  <header>
    <strong>${safeTitle}</strong>
    <span class="meta">${dataRows.length} rows &times; ${headers.length} columns</span>
  </header>
  <div class="table-wrap">
    <table>${theadHtml}${tbodyHtml}</table>
  </div>
</body>
</html>`;

    return {
      mimeType: "text/html",
      buffer: Buffer.from(htmlStructure, "utf-8"),
      displayName: input.displayName
    };
  }

  private parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          field += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          row.push(field);
          field = "";
        } else if (char === "\r" && next === "\n") {
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
          i++;
        } else if (char === "\n" || char === "\r") {
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
        } else {
          field += char;
        }
      }
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
