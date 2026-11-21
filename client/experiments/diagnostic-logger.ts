/**
 * Structured diagnostics mirrored to the browser console and bounded localStorage.
 * This is an operational log, not a substitute for the append-only experiment recorder.
 */
export type DiagnosticLevel = "debug" | "info" | "warn" | "error";

export interface DiagnosticRecord {
  schemaVersion: 1;
  timestampISO: string;
  level: DiagnosticLevel;
  category: string;
  message: string;
  experimentId?: string;
  simulationTimeSeconds?: number;
  frameNumber?: number;
  correlationIds?: Record<string, string>;
  data?: Record<string, unknown>;
}

export interface DiagnosticLoggerOptions {
  storage?: Storage;
  storageKey?: string;
  maxRecords?: number;
  consolePrefix?: string;
  consoleObject?: Pick<Console, "debug" | "info" | "warn" | "error">;
}

export class DiagnosticLogger {
  private readonly storage?: Storage;
  private readonly storageKey: string;
  private readonly maxRecords: number;
  private readonly prefix: string;
  private readonly consoleObject: Pick<Console, "debug" | "info" | "warn" | "error">;

  constructor(options: DiagnosticLoggerOptions = {}) {
    this.storage = options.storage;
    this.storageKey = options.storageKey ?? "m1as.diagnostics.v1";
    this.maxRecords = Math.max(10, options.maxRecords ?? 500);
    this.prefix = options.consolePrefix ?? "[M1AS]";
    this.consoleObject = options.consoleObject ?? console;
  }

  log(input: Omit<DiagnosticRecord, "schemaVersion" | "timestampISO">): DiagnosticRecord {
    const record: DiagnosticRecord = {
      schemaVersion: 1,
      timestampISO: new Date().toISOString(),
      ...input,
    };

    const method = this.consoleObject[record.level];
    try { method.call(this.consoleObject, this.prefix, record); } catch { /* diagnostics never interrupt simulation */ }
    this.persist(record);
    return record;
  }

  debug(category: string, message: string, data?: Record<string, unknown>): DiagnosticRecord {
    return this.log({ level: "debug", category, message, data });
  }
  info(category: string, message: string, data?: Record<string, unknown>): DiagnosticRecord {
    return this.log({ level: "info", category, message, data });
  }
  warn(category: string, message: string, data?: Record<string, unknown>): DiagnosticRecord {
    return this.log({ level: "warn", category, message, data });
  }
  error(category: string, message: string, data?: Record<string, unknown>): DiagnosticRecord {
    return this.log({ level: "error", category, message, data });
  }

  readRecent(): DiagnosticRecord[] {
    if (!this.storage) return [];
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(this.storageKey) ?? "[]");
      return Array.isArray(parsed) ? parsed as DiagnosticRecord[] : [];
    } catch {
      return [];
    }
  }

  clear(): void {
    try { this.storage?.removeItem(this.storageKey); } catch { /* storage may be unavailable */ }
  }

  private persist(record: DiagnosticRecord): void {
    if (!this.storage) return;
    try {
      const records = this.readRecent();
      records.push(record);
      const bounded = records.slice(-this.maxRecords);
      this.storage.setItem(this.storageKey, JSON.stringify(bounded));
    } catch {
      // Quota/security failures are intentionally non-fatal; console still receives the record.
    }
  }
}

/** Accessing window.localStorage can itself throw in restricted browser contexts. */
export function createBrowserDiagnosticLogger(): DiagnosticLogger {
  let storage: Storage | undefined;
  try { storage = typeof window !== "undefined" ? window.localStorage : undefined; } catch { storage = undefined; }
  return new DiagnosticLogger({ storage });
}
