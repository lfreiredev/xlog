import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { FileSink } from "../../src/sinks/file";
import type { LogEvent } from "../../src/types";

function makeEvent(i: number): LogEvent {
  return {
    ts: new Date().toISOString(),
    level: "info",
    msg: `event_${i}`,
    service: "bench",
    env: "test",
    context: { i }
  };
}

function runBatch(name: string, sink: FileSink, count: number): { ms: number; linesPerSec: number } {
  const start = performance.now();
  for (let i = 0; i < count; i += 1) {
    sink.write(makeEvent(i));
  }
  sink.flush();
  const ms = performance.now() - start;
  const linesPerSec = Math.round((count / ms) * 1000);
  // eslint-disable-next-line no-console
  console.log(`${name} | count=${count} | ms=${ms.toFixed(1)} | lines/s=${linesPerSec}`);
  return { ms, linesPerSec };
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function main(): void {
  const count = Number(process.env.COUNT ?? 100_000);
  const tmpDir = fs.mkdtempSync(path.join(process.cwd(), "tmp-bench-"));
  ensureDir(tmpDir);

  const nonBatchPath = path.join(tmpDir, "non-batch.log");
  const batchPath = path.join(tmpDir, "batch.log");

  const nonBatch = new FileSink({
    filePath: nonBatchPath,
    maxBytes: 50_000_000,
    batch: { enabled: false }
  });

  const batch = new FileSink({
    filePath: batchPath,
    maxBytes: 50_000_000,
    batch: { maxEvents: 200, maxBytes: 128_000, flushIntervalMs: 100 }
  });

  // eslint-disable-next-line no-console
  console.log(`\n== file sink batch benchmark ==`);
  runBatch("non-batch", nonBatch, count);
  runBatch("batch", batch, count);
}

main();
