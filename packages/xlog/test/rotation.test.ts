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

describe("FileSink rotation", () => {
  it("rotates when maxBytes is exceeded", () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), "tmp-rot-"));
    const filePath = path.join(dir, "app.log");
    const sink = new FileSink({ filePath, maxBytes: 120 });

    sink.write(makeEvent("first"));
    sink.write(makeEvent("second"));
    sink.write(makeEvent("third"));

    const files = fs.readdirSync(dir);
    const rotated = files.filter((f) => f.startsWith("app.log.") && f.endsWith(".log"));
    expect(rotated.length).toBeGreaterThan(0);
  });
});
