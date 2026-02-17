import fs from "node:fs";
import path from "node:path";
import { LogEvent, Sink } from "../types";

export interface FileSinkOptions {
  filePath: string;
  maxBytes: number;
  batch?: FileSinkBatchOptions;
}

export interface FileSinkBatchOptions {
  enabled?: boolean;
  maxBytes?: number;
  maxEvents?: number;
  flushIntervalMs?: number;
}

const DEFAULT_BATCH: Required<FileSinkBatchOptions> = {
  enabled: false,
  maxBytes: 64 * 1024,
  maxEvents: 100,
  flushIntervalMs: 100
};

export class FileSink implements Sink {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private size: number;
  private readonly batch?: Required<FileSinkBatchOptions>;
  private buffer: string[] = [];
  private bufferBytes = 0;
  private flushTimer?: NodeJS.Timeout;

  constructor(options: FileSinkOptions) {
    this.filePath = options.filePath;
    this.maxBytes = options.maxBytes;
    ensureDir(path.dirname(this.filePath));
    this.size = getFileSizeSafe(this.filePath);
    this.batch = resolveBatchOptions(options.batch);
  }

  write(event: LogEvent): void {
    const line = JSON.stringify(event) + "\n";
    const lineBytes = Buffer.byteLength(line);
    if (!this.batch) {
      this.appendLine(line, lineBytes);
      return;
    }

    this.buffer.push(line);
    this.bufferBytes += lineBytes;

    if (this.buffer.length >= this.batch.maxEvents || this.bufferBytes >= this.batch.maxBytes) {
      this.flushBuffered();
      return;
    }

    this.scheduleFlush();
  }

  flush(): Promise<void> {
    if (this.batch) {
      this.flushBuffered();
    }
    return Promise.resolve();
  }

  private rotate(): void {
    if (!fs.existsSync(this.filePath)) {
      this.size = 0;
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rotated = `${this.filePath}.${stamp}.log`;
    fs.renameSync(this.filePath, rotated);
    this.size = 0;
  }

  private appendLine(line: string, lineBytes: number): void {
    if (this.size + lineBytes > this.maxBytes) {
      this.rotate();
    }
    fs.appendFileSync(this.filePath, line, "utf8");
    this.size += lineBytes;
  }

  private flushBuffered(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.buffer.length === 0) return;
    while (this.buffer.length > 0) {
      if (this.size >= this.maxBytes) {
        this.rotate();
      }

      let chunk = "";
      let chunkBytes = 0;

      while (this.buffer.length > 0) {
        const line = this.buffer[0];
        const lineBytes = Buffer.byteLength(line);

        if (this.size + lineBytes > this.maxBytes && this.size > 0 && chunkBytes === 0) {
          this.rotate();
          continue;
        }

        if (this.size + chunkBytes + lineBytes > this.maxBytes && chunkBytes > 0) {
          break;
        }

        this.buffer.shift();
        chunk += line;
        chunkBytes += lineBytes;
      }

      if (chunkBytes > 0) {
        fs.appendFileSync(this.filePath, chunk, "utf8");
        this.size += chunkBytes;
      }
    }

    this.bufferBytes = 0;
  }

  private scheduleFlush(): void {
    if (!this.batch) return;
    if (this.flushTimer) return;
    const delay = Math.max(1, this.batch.flushIntervalMs);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flushBuffered();
    }, delay);
  }
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function getFileSizeSafe(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function resolveBatchOptions(options?: FileSinkBatchOptions): Required<FileSinkBatchOptions> | undefined {
  if (!options) return undefined;
  const enabled = options.enabled ?? true;
  if (!enabled) return undefined;
  return {
    enabled: true,
    maxBytes: options.maxBytes ?? DEFAULT_BATCH.maxBytes,
    maxEvents: options.maxEvents ?? DEFAULT_BATCH.maxEvents,
    flushIntervalMs: options.flushIntervalMs ?? DEFAULT_BATCH.flushIntervalMs
  };
}
