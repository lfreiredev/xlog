import fs from "node:fs";
import path from "node:path";
import { xxhash64 } from "./xxhash64";
import type { LogEvent } from "../types";

const MAGIC = 0x584c4f47;
const VERSION = 1;
const HEADER_BYTES = 4 + 2 + 2 + 8 + 4 + 8;

export interface WalConfig {
  dir: string;
  segmentMaxBytes?: number;
  indexStride?: number;
  enableTraceIndex?: boolean;
  enableRequestIndex?: boolean;
}

export interface WalRecord {
  offset: number;
  event: LogEvent;
}

export interface WalRecordWithSize extends WalRecord {
  size: number;
}

export interface WalSegmentInfo {
  filePath: string;
  startTsMs: number;
  seq: number;
  size: number;
}

const DEFAULT_SEGMENT_MAX_BYTES = 256 * 1024 * 1024;
const DEFAULT_INDEX_STRIDE = 100;

export class WalWriter {
  private readonly dir: string;
  private readonly segmentMaxBytes: number;
  private readonly indexStride: number;
  private readonly enableTraceIndex: boolean;
  private readonly enableRequestIndex: boolean;

  private segment?: WalSegmentInfo;
  private fd?: number;
  private timeIdxFd?: number;
  private traceIdxFd?: number;
  private reqIdxFd?: number;
  private offset = 0;
  private recordCount = 0;

  constructor(config: WalConfig) {
    this.dir = config.dir;
    this.segmentMaxBytes = config.segmentMaxBytes ?? DEFAULT_SEGMENT_MAX_BYTES;
    this.indexStride = config.indexStride ?? DEFAULT_INDEX_STRIDE;
    this.enableTraceIndex = config.enableTraceIndex ?? true;
    this.enableRequestIndex = config.enableRequestIndex ?? true;

    fs.mkdirSync(this.dir, { recursive: true });
    const segments = listSegments(this.dir);
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      recoverSegment(last, this.indexStride, this.enableTraceIndex, this.enableRequestIndex);
      this.openSegment(last);
    } else {
      this.rotate(Date.now());
    }
  }

  write(event: LogEvent): void {
    const payload = Buffer.from(JSON.stringify(event), "utf8");
    const header = Buffer.alloc(HEADER_BYTES);
    header.writeUInt32LE(MAGIC, 0);
    header.writeUInt16LE(VERSION, 4);
    header.writeUInt16LE(0, 6);
    header.writeBigUInt64LE(BigInt(event.ts ? Date.parse(event.ts) : Date.now()), 8);
    header.writeUInt32LE(payload.length, 16);

    const checksumInput = Buffer.concat([header.subarray(4, 20), payload]);
    const checksum = xxhash64(checksumInput);
    header.writeBigUInt64LE(checksum, 20);

    const recordBytes = header.length + payload.length;
    if (!this.segment || this.offset + recordBytes > this.segmentMaxBytes) {
      this.rotate(Date.parse(event.ts));
    }

    if (!this.fd) throw new Error("WAL segment not open");
    fs.writeSync(this.fd, header, 0, header.length, this.offset);
    fs.writeSync(this.fd, payload, 0, payload.length, this.offset + header.length);

    this.writeIndexes(event, this.offset, header, payload);

    this.offset += recordBytes;
    this.recordCount += 1;
    if (this.segment) this.segment.size = this.offset;
  }

  close(): void {
    if (this.fd) fs.closeSync(this.fd);
    if (this.timeIdxFd) fs.closeSync(this.timeIdxFd);
    if (this.traceIdxFd) fs.closeSync(this.traceIdxFd);
    if (this.reqIdxFd) fs.closeSync(this.reqIdxFd);
    this.fd = undefined;
    this.timeIdxFd = undefined;
    this.traceIdxFd = undefined;
    this.reqIdxFd = undefined;
  }

  private rotate(tsMs: number): void {
    this.close();
    const seq = nextSeq(this.dir);
    const startTsMs = Number.isFinite(tsMs) ? tsMs : Date.now();
    const filePath = segmentPath(this.dir, startTsMs, seq);
    this.segment = { filePath, startTsMs, seq, size: 0 };
    this.fd = fs.openSync(filePath, "a+");
    this.offset = fs.statSync(filePath).size;
    this.recordCount = 0;

    this.timeIdxFd = fs.openSync(timeIndexPath(filePath), "a+");
    if (this.enableTraceIndex) this.traceIdxFd = fs.openSync(traceIndexPath(filePath), "a+");
    if (this.enableRequestIndex) this.reqIdxFd = fs.openSync(requestIndexPath(filePath), "a+");
  }

  private openSegment(seg: WalSegmentInfo): void {
    this.segment = seg;
    this.fd = fs.openSync(seg.filePath, "a+");
    this.offset = fs.statSync(seg.filePath).size;
    this.recordCount = 0;

    this.timeIdxFd = fs.openSync(timeIndexPath(seg.filePath), "a+");
    if (this.enableTraceIndex) this.traceIdxFd = fs.openSync(traceIndexPath(seg.filePath), "a+");
    if (this.enableRequestIndex) this.reqIdxFd = fs.openSync(requestIndexPath(seg.filePath), "a+");
  }

  private writeIndexes(event: LogEvent, offset: number, header: Buffer, payload: Buffer): void {
    if (!this.segment) return;
    const tsMs = header.readBigUInt64LE(8);

    if (this.timeIdxFd && this.recordCount % this.indexStride === 0) {
      const buf = Buffer.alloc(16);
      buf.writeBigUInt64LE(tsMs, 0);
      buf.writeBigUInt64LE(BigInt(offset), 8);
      fs.writeSync(this.timeIdxFd, buf);
    }

    const ctx = event.context || {};
    const traceId = typeof ctx["traceId"] === "string" ? (ctx["traceId"] as string) : undefined;
    const requestId = typeof ctx["requestId"] === "string" ? (ctx["requestId"] as string) : undefined;

    if (this.traceIdxFd && traceId) {
      const buf = Buffer.alloc(16);
      buf.writeBigUInt64LE(xxhash64(Buffer.from(traceId, "utf8")), 0);
      buf.writeBigUInt64LE(BigInt(offset), 8);
      fs.writeSync(this.traceIdxFd, buf);
    }

    if (this.reqIdxFd && requestId) {
      const buf = Buffer.alloc(16);
      buf.writeBigUInt64LE(xxhash64(Buffer.from(requestId, "utf8")), 0);
      buf.writeBigUInt64LE(BigInt(offset), 8);
      fs.writeSync(this.reqIdxFd, buf);
    }
  }
}

export class WalReader {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  *scanAll(): Generator<WalRecord> {
    const segments = listSegments(this.dir);
    for (const seg of segments) {
      yield* scanSegment(seg.filePath);
    }
  }

  *scanByTime(fromTsMs: number, toTsMs?: number): Generator<WalRecord> {
    const segments = listSegments(this.dir);
    for (const seg of segments) {
      const start = seekByTimeIndex(seg.filePath, fromTsMs);
      yield* scanSegment(seg.filePath, { startOffset: start, fromTsMs, toTsMs });
    }
  }

  *scanByTraceId(traceId: string): Generator<WalRecord> {
    const segments = listSegments(this.dir);
    const hash = xxhash64(Buffer.from(traceId, "utf8"));
    for (const seg of segments) {
      const offsets = readIndexOffsets(traceIndexPath(seg.filePath), hash);
      for (const offset of offsets) {
        const rec = readRecordAt(seg.filePath, offset);
        if (rec && rec.event.context?.["traceId"] === traceId) {
          yield { offset, event: rec.event };
        }
      }
    }
  }

  *scanByRequestId(requestId: string): Generator<WalRecord> {
    const segments = listSegments(this.dir);
    const hash = xxhash64(Buffer.from(requestId, "utf8"));
    for (const seg of segments) {
      const offsets = readIndexOffsets(requestIndexPath(seg.filePath), hash);
      for (const offset of offsets) {
        const rec = readRecordAt(seg.filePath, offset);
        if (rec && rec.event.context?.["requestId"] === requestId) {
          yield { offset, event: rec.event };
        }
      }
    }
  }
}

export function* scanSegment(
  filePath: string,
  opts?: { startOffset?: number; fromTsMs?: number; toTsMs?: number }
): Generator<WalRecord> {
  const fd = fs.openSync(filePath, "r");
  let offset = opts?.startOffset ?? 0;
  const size = fs.statSync(filePath).size;

  try {
    while (offset + HEADER_BYTES <= size) {
      const header = Buffer.alloc(HEADER_BYTES);
      fs.readSync(fd, header, 0, HEADER_BYTES, offset);
      const magic = header.readUInt32LE(0);
      if (magic !== MAGIC) break;
      const version = header.readUInt16LE(4);
      if (version !== VERSION) break;
      const tsMs = Number(header.readBigUInt64LE(8));
      const len = header.readUInt32LE(16);
      const checksum = header.readBigUInt64LE(20);
      if (offset + HEADER_BYTES + len > size) break;

      const payload = Buffer.alloc(len);
      fs.readSync(fd, payload, 0, len, offset + HEADER_BYTES);
      const checksumInput = Buffer.concat([header.subarray(4, 20), payload]);
      const expected = xxhash64(checksumInput);
      if (expected !== checksum) break;

      const event = JSON.parse(payload.toString("utf8")) as LogEvent;
      if (opts?.fromTsMs && tsMs < opts.fromTsMs) {
        offset += HEADER_BYTES + len;
        continue;
      }
      if (opts?.toTsMs && tsMs > opts.toTsMs) {
        offset += HEADER_BYTES + len;
        continue;
      }
      yield { offset, event };
      offset += HEADER_BYTES + len;
    }
  } finally {
    fs.closeSync(fd);
  }
}

export function* readRecordsFrom(
  filePath: string,
  startOffset = 0
): Generator<WalRecordWithSize> {
  const fd = fs.openSync(filePath, "r");
  let offset = startOffset;
  const size = fs.statSync(filePath).size;

  try {
    while (offset + HEADER_BYTES <= size) {
      const header = Buffer.alloc(HEADER_BYTES);
      fs.readSync(fd, header, 0, HEADER_BYTES, offset);
      const magic = header.readUInt32LE(0);
      if (magic !== MAGIC) break;
      const version = header.readUInt16LE(4);
      if (version !== VERSION) break;
      const len = header.readUInt32LE(16);
      const checksum = header.readBigUInt64LE(20);
      if (offset + HEADER_BYTES + len > size) break;

      const payload = Buffer.alloc(len);
      fs.readSync(fd, payload, 0, len, offset + HEADER_BYTES);
      const checksumInput = Buffer.concat([header.subarray(4, 20), payload]);
      const expected = xxhash64(checksumInput);
      if (expected !== checksum) break;

      const event = JSON.parse(payload.toString("utf8")) as LogEvent;
      const recordSize = HEADER_BYTES + len;
      yield { offset, event, size: recordSize };
      offset += recordSize;
    }
  } finally {
    fs.closeSync(fd);
  }
}

export function readRecordAt(filePath: string, offset: number): { event: LogEvent } | undefined {
  const fd = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(HEADER_BYTES);
    fs.readSync(fd, header, 0, HEADER_BYTES, offset);
    const magic = header.readUInt32LE(0);
    if (magic !== MAGIC) return undefined;
    const version = header.readUInt16LE(4);
    if (version !== VERSION) return undefined;
    const len = header.readUInt32LE(16);
    const checksum = header.readBigUInt64LE(20);
    const payload = Buffer.alloc(len);
    fs.readSync(fd, payload, 0, len, offset + HEADER_BYTES);
    const checksumInput = Buffer.concat([header.subarray(4, 20), payload]);
    const expected = xxhash64(checksumInput);
    if (expected !== checksum) return undefined;
    const event = JSON.parse(payload.toString("utf8")) as LogEvent;
    return { event };
  } finally {
    fs.closeSync(fd);
  }
}

export function recoverSegment(
  seg: WalSegmentInfo,
  indexStride: number,
  enableTraceIndex: boolean,
  enableRequestIndex: boolean
): void {
  const fd = fs.openSync(seg.filePath, "r+");
  let offset = 0;
  const size = fs.statSync(seg.filePath).size;

  // Rebuild indexes for this segment
  const timeIdx = fs.openSync(timeIndexPath(seg.filePath), "w");
  const traceIdx = enableTraceIndex ? fs.openSync(traceIndexPath(seg.filePath), "w") : undefined;
  const reqIdx = enableRequestIndex ? fs.openSync(requestIndexPath(seg.filePath), "w") : undefined;
  let recordCount = 0;

  try {
    while (offset + HEADER_BYTES <= size) {
      const header = Buffer.alloc(HEADER_BYTES);
      fs.readSync(fd, header, 0, HEADER_BYTES, offset);
      const magic = header.readUInt32LE(0);
      if (magic !== MAGIC) break;
      const version = header.readUInt16LE(4);
      if (version !== VERSION) break;
      const tsMs = header.readBigUInt64LE(8);
      const len = header.readUInt32LE(16);
      const checksum = header.readBigUInt64LE(20);
      if (offset + HEADER_BYTES + len > size) break;

      const payload = Buffer.alloc(len);
      fs.readSync(fd, payload, 0, len, offset + HEADER_BYTES);
      const checksumInput = Buffer.concat([header.subarray(4, 20), payload]);
      const expected = xxhash64(checksumInput);
      if (expected !== checksum) break;

      if (recordCount % indexStride === 0) {
        const buf = Buffer.alloc(16);
        buf.writeBigUInt64LE(tsMs, 0);
        buf.writeBigUInt64LE(BigInt(offset), 8);
        fs.writeSync(timeIdx, buf);
      }

      const event = JSON.parse(payload.toString("utf8")) as LogEvent;
      const ctx = event.context || {};
      const traceId = typeof ctx["traceId"] === "string" ? (ctx["traceId"] as string) : undefined;
      const requestId =
        typeof ctx["requestId"] === "string" ? (ctx["requestId"] as string) : undefined;

      if (traceIdx && traceId) {
        const buf = Buffer.alloc(16);
        buf.writeBigUInt64LE(xxhash64(Buffer.from(traceId, "utf8")), 0);
        buf.writeBigUInt64LE(BigInt(offset), 8);
        fs.writeSync(traceIdx, buf);
      }

      if (reqIdx && requestId) {
        const buf = Buffer.alloc(16);
        buf.writeBigUInt64LE(xxhash64(Buffer.from(requestId, "utf8")), 0);
        buf.writeBigUInt64LE(BigInt(offset), 8);
        fs.writeSync(reqIdx, buf);
      }

      offset += HEADER_BYTES + len;
      recordCount += 1;
    }

    if (offset < size) {
      fs.ftruncateSync(fd, offset);
    }
  } finally {
    fs.closeSync(fd);
    fs.closeSync(timeIdx);
    if (traceIdx) fs.closeSync(traceIdx);
    if (reqIdx) fs.closeSync(reqIdx);
  }
}

export function listSegments(dir: string): WalSegmentInfo[] {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".wal"));
  const segments = files
    .map((f) => parseSegmentFilename(dir, f))
    .filter((s): s is WalSegmentInfo => !!s)
    .sort((a, b) => (a.startTsMs === b.startTsMs ? a.seq - b.seq : a.startTsMs - b.startTsMs));
  for (const seg of segments) {
    seg.size = fs.statSync(seg.filePath).size;
  }
  return segments;
}

function segmentPath(dir: string, startTsMs: number, seq: number): string {
  return path.join(dir, `xlog.${startTsMs}.${seq}.wal`);
}

function timeIndexPath(segPath: string): string {
  return segPath.replace(/\.wal$/, ".time.idx");
}

function traceIndexPath(segPath: string): string {
  return segPath.replace(/\.wal$/, ".trace.idx");
}

function requestIndexPath(segPath: string): string {
  return segPath.replace(/\.wal$/, ".req.idx");
}

function parseSegmentFilename(dir: string, file: string): WalSegmentInfo | undefined {
  const m = /^xlog\.(\d+)\.(\d+)\.wal$/.exec(file);
  if (!m) return undefined;
  const startTsMs = Number(m[1]);
  const seq = Number(m[2]);
  return { filePath: path.join(dir, file), startTsMs, seq, size: 0 };
}

function nextSeq(dir: string): number {
  const segments = listSegments(dir);
  if (segments.length === 0) return 0;
  return segments[segments.length - 1].seq + 1;
}

function readIndexOffsets(indexPath: string, hash: bigint): number[] {
  if (!fs.existsSync(indexPath)) return [];
  const buf = fs.readFileSync(indexPath);
  const offsets: number[] = [];
  for (let i = 0; i + 16 <= buf.length; i += 16) {
    const key = buf.readBigUInt64LE(i);
    if (key === hash) {
      const off = Number(buf.readBigUInt64LE(i + 8));
      offsets.push(off);
    }
  }
  return offsets;
}

function seekByTimeIndex(segPath: string, fromTsMs: number): number {
  const idxPath = timeIndexPath(segPath);
  if (!fs.existsSync(idxPath)) return 0;
  const buf = fs.readFileSync(idxPath);
  let chosen = 0;
  for (let i = 0; i + 16 <= buf.length; i += 16) {
    const tsMs = Number(buf.readBigUInt64LE(i));
    const off = Number(buf.readBigUInt64LE(i + 8));
    if (tsMs <= fromTsMs) {
      chosen = off;
    } else {
      break;
    }
  }
  return chosen;
}
