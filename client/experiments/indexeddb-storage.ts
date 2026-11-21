import type { ExperimentId, ExperimentManifest, ExperimentRecord, ExperimentTime } from "./contracts.js";
import type { ExperimentStorage } from "./recorder.js";

interface StoredManifest {
  experimentId: ExperimentId;
  manifest: ExperimentManifest;
  createdAtISO: string;
}
interface StoredRecord {
  key: string;
  experimentId: ExperimentId;
  stream: string;
  record: ExperimentRecord;
}
interface StoredFinalization {
  experimentId: ExperimentId;
  endedAt: ExperimentTime;
  finalizedAtISO: string;
}

/**
 * Durable browser-local experiment storage.
 * Records are append-only and indexed by experiment and stream.
 */
export class IndexedDbExperimentStorage implements ExperimentStorage {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly databaseName = "m1as-experiments",
    private readonly databaseVersion = 1,
  ) {}

  async createManifest(manifest: ExperimentManifest): Promise<void> {
    const db = await this.open();
    await this.transaction(db, ["manifests"], "readwrite", (tx) => {
      tx.objectStore("manifests").put({
        experimentId: manifest.experimentId,
        manifest,
        createdAtISO: new Date().toISOString(),
      } satisfies StoredManifest);
    });
  }

  async appendRecords(
    experimentId: ExperimentId,
    stream: string,
    records: readonly ExperimentRecord[],
  ): Promise<void> {
    if (records.length === 0) return;
    const db = await this.open();
    await this.transaction(db, ["records"], "readwrite", (tx) => {
      const store = tx.objectStore("records");
      for (const record of records) {
        const key = [experimentId, stream, record.time.sequenceNumber, record.recordId].join(":");
        store.add({ key, experimentId, stream, record } satisfies StoredRecord);
      }
    });
  }

  async finalize(experimentId: ExperimentId, endedAt: ExperimentTime): Promise<void> {
    const db = await this.open();
    await this.transaction(db, ["finalizations"], "readwrite", (tx) => {
      tx.objectStore("finalizations").put({
        experimentId,
        endedAt,
        finalizedAtISO: new Date().toISOString(),
      } satisfies StoredFinalization);
    });
  }

  async readExperiment(experimentId: ExperimentId): Promise<{
    manifest: ExperimentManifest | null;
    streams: Record<string, ExperimentRecord[]>;
    endedAt: ExperimentTime | null;
  }> {
    const db = await this.open();
    const [manifestRow, recordRows, finalRow] = await Promise.all([
      this.request<StoredManifest | undefined>(db.transaction("manifests", "readonly")
        .objectStore("manifests").get(experimentId)),
      this.request<StoredRecord[]>(db.transaction("records", "readonly")
        .objectStore("records").index("byExperiment").getAll(IDBKeyRange.only(experimentId))),
      this.request<StoredFinalization | undefined>(db.transaction("finalizations", "readonly")
        .objectStore("finalizations").get(experimentId)),
    ]);
    const streams: Record<string, ExperimentRecord[]> = {};
    for (const row of recordRows) (streams[row.stream] ??= []).push(row.record);
    for (const rows of Object.values(streams)) {
      rows.sort((a, b) => a.time.sequenceNumber - b.time.sequenceNumber);
    }
    return { manifest: manifestRow?.manifest ?? null, streams, endedAt: finalRow?.endedAt ?? null };
  }

  close(): void {
    void this.databasePromise?.then(db => db.close());
    this.databasePromise = null;
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is unavailable in this environment."));
        return;
      }
      const request = indexedDB.open(this.databaseName, this.databaseVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("manifests")) db.createObjectStore("manifests", { keyPath: "experimentId" });
        if (!db.objectStoreNames.contains("records")) {
          const records = db.createObjectStore("records", { keyPath: "key" });
          records.createIndex("byExperiment", "experimentId", { unique: false });
          records.createIndex("byExperimentStream", ["experimentId", "stream"], { unique: false });
        }
        if (!db.objectStoreNames.contains("finalizations")) db.createObjectStore("finalizations", { keyPath: "experimentId" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open experiment database."));
      request.onblocked = () => reject(new Error("Experiment database upgrade is blocked by another open tab."));
    });
    return this.databasePromise;
  }

  private transaction(
    db: IDBDatabase,
    stores: string[],
    mode: IDBTransactionMode,
    enqueue: (transaction: IDBTransaction) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
      try { enqueue(tx); } catch (error) { tx.abort(); reject(error); }
    });
  }

  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
    });
  }
}
