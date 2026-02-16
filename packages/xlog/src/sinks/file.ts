import fs from "node:fs";
import path from "node:path";
import { LogEvent, Sink } from "../types";

export interface FileSinkOptions {
  filePath: string;
  maxBytes: number;
}

export class FileSink implements Sink {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private size: number;

  constructor(options: FileSinkOptions) {
    this.filePath = options.filePath;
    this.maxBytes = options.maxBytes;
    ensureDir(path.dirname(this.filePath));
    this.size = getFileSizeSafe(this.filePath);
  }

  write(event: LogEvent): void {
    const line = JSON.stringify(event) + "\n";
    if (this.size + Buffer.byteLength(line) > this.maxBytes) {
      this.rotate();
    }
    fs.appendFileSync(this.filePath, line, "utf8");
    this.size += Buffer.byteLength(line);
  }

  flush(): Promise<void> {
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
