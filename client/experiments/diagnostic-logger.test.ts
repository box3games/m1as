import test from "node:test";
import assert from "node:assert/strict";
import { DiagnosticLogger } from "./diagnostic-logger.js";

test("diagnostic logger mirrors structured records to console and bounded local storage", () => {
  let stored = "[]";
  const storage = {
    getItem: (_key: string) => stored,
    setItem: (_key: string, value: string) => { stored = value; },
    removeItem: (_key: string) => { stored = "[]"; },
  } as unknown as Storage;
  const seen: unknown[] = [];
  const consoleObject = {
    debug: (...args: unknown[]) => seen.push(args),
    info: (...args: unknown[]) => seen.push(args),
    warn: (...args: unknown[]) => seen.push(args),
    error: (...args: unknown[]) => seen.push(args),
  };
  const logger = new DiagnosticLogger({ storage, maxRecords: 10, consoleObject });
  for (let i = 0; i < 12; i++) logger.info("test", "record", { index: i });
  const records = logger.readRecent();
  assert.equal(seen.length, 12);
  assert.equal(records.length, 10);
  assert.equal(records[0].data?.index, 2);
  assert.equal(records[9].data?.index, 11);
  logger.clear();
  assert.equal(logger.readRecent().length, 0);
});

test("storage failures do not prevent console diagnostics", () => {
  const seen: unknown[] = [];
  const storage = {
    getItem: () => { throw new Error("storage blocked"); },
    setItem: () => { throw new Error("quota exceeded"); },
    removeItem: () => {},
  } as unknown as Storage;
  const consoleObject = {
    debug: (...args: unknown[]) => seen.push(args),
    info: (...args: unknown[]) => seen.push(args),
    warn: (...args: unknown[]) => seen.push(args),
    error: (...args: unknown[]) => seen.push(args),
  };
  const logger = new DiagnosticLogger({ storage, consoleObject });
  assert.doesNotThrow(() => logger.error("test", "must remain visible"));
  assert.equal(seen.length, 1);
});
