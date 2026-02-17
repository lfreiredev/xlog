import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileSink } from "../src/sinks/file";
import type { LogEvent } from "../src/types";

function makeEvent(msg: string): LogEvent {
  return {
    ts: new Date().toISOString(),
    level: "info",
    msg,
    service: "svc",
    env: "test",
    context: {}
  };
}

describe("FileSink batching", () => {
  it("buffers until flush", async () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), "tmp-batch-"));
    const filePath = path.join(dir, "app.log");
    const sink = new FileSink({
      filePath,
      maxBytes: 1_000_000,
      batch: { maxEvents: 3, flushIntervalMs: 60_000 }
    });

    sink.write(makeEvent("first"));
    sink.write(makeEvent("second"));

    expect(fs.existsSync(filePath)).toBe(false);

    await sink.flush();
    const contents = fs.readFileSync(filePath, "utf8").trim().split("\n");
    expect(contents.length).toBe(2);
  });

  it("flushes when maxEvents is reached", () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), "tmp-batch-"));
    const filePath = path.join(dir, "app.log");
    const sink = new FileSink({
      filePath,
      maxBytes: 1_000_000,
      batch: { maxEvents: 3, flushIntervalMs: 60_000 }
    });

    sink.write(makeEvent("first"));
    sink.write(makeEvent("second"));
    sink.write(makeEvent("third"));

    const contents = fs.readFileSync(filePath, "utf8").trim().split("\n");
    expect(contents.length).toBe(3);
  });

  it("splits batch across rotation boundary", () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), "tmp-batch-"));
    const filePath = path.join(dir, "app.log");
    const sink = new FileSink({
      filePath,
      maxBytes: 220,
      batch: { maxEvents: 100, flushIntervalMs: 60_000 }
    });

    sink.write(makeEvent("first"));
    sink.write(makeEvent("second"));
    sink.write(makeEvent("third"));
    sink.flush();

    const files = fs.readdirSync(dir).filter((f) => f.startsWith("app.log"));
    const rotated = files.filter((f) => f.startsWith("app.log.") && f.endsWith(".log"));

    expect(rotated.length).toBeGreaterThan(0);
    const current = fs.readFileSync(filePath, "utf8").trim().split("\n");
    expect(current.length).toBeGreaterThan(0);
  });
});
