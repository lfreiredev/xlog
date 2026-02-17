import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WalReader, WalWriter, listSegments, recoverSegment } from "../src/store/wal";
import type { LogEvent } from "../src/types";

function makeEvent(msg: string, tsMs: number, ctx?: Record<string, unknown>): LogEvent {
  return {
    ts: new Date(tsMs).toISOString(),
    level: "info",
    msg,
    service: "svc",
    env: "test",
    context: ctx ?? {}
  };
}

describe("WAL writer/reader", () => {
  it("writes and reads records", () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), "tmp-wal-"));
    const writer = new WalWriter({ dir, segmentMaxBytes: 1024 * 1024 });

    writer.write(makeEvent("a", 1, { requestId: "r1", traceId: "t1" }));
    writer.write(makeEvent("b", 2, { requestId: "r2", traceId: "t1" }));
    writer.write(makeEvent("c", 3, { requestId: "r1", traceId: "t2" }));
    writer.close();

    const reader = new WalReader(dir);
    const all = Array.from(reader.scanAll());
    expect(all.length).toBe(3);

    const byTrace = Array.from(reader.scanByTraceId("t1"));
    expect(byTrace.length).toBe(2);

    const byReq = Array.from(reader.scanByRequestId("r1"));
    expect(byReq.length).toBe(2);
  });

  it("recovers by truncating partial record and rebuilding indexes", () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), "tmp-wal-"));
    const writer = new WalWriter({ dir, segmentMaxBytes: 1024 * 1024 });

    writer.write(makeEvent("a", 10, { requestId: "r1" }));
    writer.write(makeEvent("b", 11, { requestId: "r2" }));
    writer.close();

    const seg = listSegments(dir)[0];
    const fd = fs.openSync(seg.filePath, "r+");
    const size = fs.statSync(seg.filePath).size;
    fs.ftruncateSync(fd, size - 10); // corrupt tail
    fs.closeSync(fd);

    recoverSegment(seg, 1, true, true);

    const reader = new WalReader(dir);
    const all = Array.from(reader.scanAll());
    expect(all.length).toBe(1);
    expect(all[0].event.msg).toBe("a");
  });
});
